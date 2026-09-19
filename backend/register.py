# Roguelike Game Design Platform — plugin backend / MCP tools
#
# Per-project design state lives at <project>/.ducky/roguelike-design/store.json.

import json
import shutil
import base64
import time
from pathlib import Path

from .defaults import default_state, merge_defaults, _progression_level_table
from .store_io import project_key, read_store, write_store as persist_store
from .panel_rpc import register_panel_rpcs
from .ui_screens import register_ui_tools
from .skill_tree_ui import sync_skill_tree_ui
from .armory_ui import sync_armory_ui
from .chunk_tools import register_chunk_tools

WORLD_STEP = 512  # UEFN units per grid cell
MAX_DIM = 100000  # max grid width/height (cells)
DENSE_MAX_CELLS = 16384  # beyond this, store painted cells sparsely


def _clamp_dim(n, lo=4, hi=MAX_DIM):
    try:
        n = int(n)
    except Exception:
        n = lo
    return max(lo, min(hi, n))


def _empty_cell():
    return {"terrain": "empty", "entity": None}


def _is_sparse(grid):
    return isinstance(grid, dict) and bool(grid.get("_sparse"))


def _cell_key(x, y):
    return "%d,%d" % (int(x), int(y))


def _get_cell(level, x, y):
    grid = level.get("grid")
    if _is_sparse(grid):
        c = (grid.get("cells") or {}).get(_cell_key(x, y))
        return dict(c) if isinstance(c, dict) else _empty_cell()
    if isinstance(grid, list) and 0 <= y < len(grid) and 0 <= x < len(grid[y]):
        c = grid[y][x]
        return c if isinstance(c, dict) else _empty_cell()
    return _empty_cell()


def _set_cell(level, x, y, cell):
    grid = level.get("grid")
    terr = (cell or {}).get("terrain") or "empty"
    ent = (cell or {}).get("entity")
    if _is_sparse(grid):
        cells = grid.setdefault("cells", {})
        k = _cell_key(x, y)
        if terr == "empty" and not ent:
            cells.pop(k, None)
        else:
            cells[k] = {"terrain": terr, "entity": ent}
        return
    if isinstance(grid, list) and 0 <= y < len(grid) and 0 <= x < len(grid[y]):
        grid[y][x] = {"terrain": terr, "entity": ent}


def _iter_painted(level):
    """Yield (x, y, cell) for cells that matter (terrain or entity)."""
    grid = level.get("grid")
    w = int(level.get("w") or 0)
    h = int(level.get("h") or 0)
    if _is_sparse(grid):
        for k, c in list((grid.get("cells") or {}).items()):
            try:
                xs, ys = k.split(",", 1)
                x, y = int(xs), int(ys)
            except Exception:
                continue
            if 0 <= x < w and 0 <= y < h and isinstance(c, dict):
                if c.get("terrain") not in (None, "empty") or c.get("entity"):
                    yield x, y, c
        return
    if isinstance(grid, list):
        for y in range(min(h, len(grid))):
            row = grid[y]
            for x in range(min(w, len(row))):
                c = row[x]
                if isinstance(c, dict) and (c.get("terrain") not in (None, "empty") or c.get("entity")):
                    yield x, y, c


def _make_grid(w, h, old=None):
    w = _clamp_dim(w)
    h = _clamp_dim(h)
    use_sparse = (w * h) > DENSE_MAX_CELLS
    cells = {}
    if _is_sparse(old):
        for k, c in (old.get("cells") or {}).items():
            try:
                xs, ys = k.split(",", 1)
                x, y = int(xs), int(ys)
            except Exception:
                continue
            if 0 <= x < w and 0 <= y < h and isinstance(c, dict):
                if c.get("terrain") not in (None, "empty") or c.get("entity"):
                    cells[_cell_key(x, y)] = {
                        "terrain": c.get("terrain") or "empty",
                        "entity": c.get("entity"),
                    }
    elif isinstance(old, list):
        for y, row in enumerate(old):
            if y >= h:
                break
            for x, c in enumerate(row):
                if x >= w:
                    break
                if isinstance(c, dict) and (c.get("terrain") not in (None, "empty") or c.get("entity")):
                    cells[_cell_key(x, y)] = {
                        "terrain": c.get("terrain") or "empty",
                        "entity": c.get("entity"),
                    }
    if use_sparse:
        return {"_sparse": True, "cells": cells}
    g = []
    for y in range(h):
        row = []
        for x in range(w):
            k = _cell_key(x, y)
            row.append(dict(cells[k]) if k in cells else _empty_cell())
        g.append(row)
    return g


# Default assets used to realise grid terrain. Overridable per-level via
# level["assets"]. These are Creative content paths (read/search only) that
# the listener resolves to spawnable *_C classes.
DEFAULT_ASSETS = {
    "wall": "/Game/Creative/Devices/Prop_Wall_Metal_A_C",
    "door": "/Game/Creative/Devices/Prop_Door_A_C",
    "npc":  "/Game/Creative/Devices/Guard_Spawner_C",
    "item": "/Game/Creative/Devices/Item_Spawner_C",
}


def _seed():
    return default_state()


_active_key = None
_STATE_RAW = None
_STATE_MTIME = None


def _ensure_state():
    """Load design state, re-reading from disk when the store file changes."""
    global _active_key, _STATE_RAW, _STATE_MTIME
    from .store_io import store_path

    key = project_key()
    path = store_path()
    try:
        mtime = path.stat().st_mtime if path.is_file() else None
    except OSError:
        mtime = None
    if _STATE_RAW is None or key != _active_key or mtime != _STATE_MTIME:
        _active_key = key
        _STATE_RAW = read_store(_seed)
        _STATE_MTIME = mtime
    return _STATE_RAW


def _reload_catalogue_modules() -> None:
    """Hot-reload chunks/defaults so merge_defaults sees current Egypt paths.

    Purge every sys.modules entry for this plugin's chunks/defaults (host may
    keep both uefn_plugins + ai_plugins copies) then re-import from disk.
    """
    import importlib
    import sys

    drop = [
        n
        for n in list(sys.modules)
        if n.endswith(".chunks")
        or n.endswith(".defaults")
        or n.endswith(".chunk_tools")
        or n.endswith(".store_io")
        or n.endswith(".procgen")
    ]
    # Only drop modules that live under this plugin package tree.
    here = str(Path(__file__).resolve().parent)
    for n in drop:
        mod = sys.modules.get(n)
        fn = getattr(mod, "__file__", None) or ""
        try:
            if fn and str(Path(fn).resolve()).startswith(here):
                del sys.modules[n]
        except Exception:
            pass

    from . import chunks as chunks_mod  # noqa: F401
    from . import defaults as defaults_mod  # noqa: F401

    importlib.reload(chunks_mod)
    importlib.reload(defaults_mod)


def _reload_state_from_disk():
    """Drop the in-memory cache and load the project store again."""
    global _active_key, _STATE_RAW, _STATE_MTIME, merge_defaults, default_state
    _reload_catalogue_modules()
    from . import defaults as defaults_mod

    merge_defaults = defaults_mod.merge_defaults
    default_state = defaults_mod.default_state
    _active_key = None
    _STATE_RAW = None
    _STATE_MTIME = None
    return _ensure_state()


class _LazyState(dict):
    """Dict facade that refreshes from the active project on every access."""

    def _live(self):
        return _ensure_state()

    def __getitem__(self, key):
        return self._live()[key]

    def __setitem__(self, key, value):
        self._live()[key] = value

    def __delitem__(self, key):
        del self._live()[key]

    def __contains__(self, key):
        return key in self._live()

    def __iter__(self):
        return iter(self._live())

    def __len__(self):
        return len(self._live())

    def get(self, key, default=None):
        return self._live().get(key, default)

    def setdefault(self, key, default=None):
        return self._live().setdefault(key, default)

    def keys(self):
        return self._live().keys()

    def values(self):
        return self._live().values()

    def items(self):
        return self._live().items()

    def update(self, *args, **kwargs):
        return self._live().update(*args, **kwargs)

    def pop(self, key, *args):
        return self._live().pop(key, *args)


# Module-level facade used by all tools (keeps MCP function signatures clean).
_STATE = _LazyState()


def _set_state(state):
    global _STATE_RAW, _active_key, _STATE_MTIME
    from .store_io import store_path

    _active_key = project_key()
    _STATE_RAW = state
    _save(_STATE_RAW)
    try:
        path = store_path()
        _STATE_MTIME = path.stat().st_mtime if path.is_file() else None
    except OSError:
        _STATE_MTIME = None


def _save(state=None):
    """Persist design state. Never json-dump the LazyState facade (it serializes as {})."""
    global _STATE_MTIME
    try:
        if state is None or isinstance(state, _LazyState):
            data = _ensure_state()
        elif isinstance(state, dict):
            data = state
        else:
            data = _ensure_state()
        persist_store(data)
        # Keep mtime in sync so the next _ensure_state does not re-read +
        # merge_defaults over a just-written store (stale DEFAULT clobber).
        try:
            from .store_io import store_path

            path = store_path()
            _STATE_MTIME = path.stat().st_mtime if path.is_file() else None
        except OSError:
            pass
    except Exception as e:
        print("[rgd] state save failed:", e)


# The panel iframe is sandboxed and cannot see the main-window host object, so the
# rgd_* tools are also exposed over the panel bridge. Without this, panel buttons
# (build/spawn/sync) fall back to the local simulation and silently do nothing.
_PANEL_TOOL_FNS: dict = {}


def call_tool(name: str = "", args: dict | None = None, **_kwargs):
    key = name if name.startswith("rgd_") else "rgd_" + name
    fn = _PANEL_TOOL_FNS.get(key) or _PANEL_TOOL_FNS.get(name)
    if fn is None:
        # Helpful hint when backend wasn't reloaded after an update.
        known = sorted(k for k in _PANEL_TOOL_FNS if "chunk_asset" in k or k.endswith("from_uefn"))
        hint = (" · known: " + ", ".join(known[:8])) if known else " · applies on next start"
        return {"ok": False, "error": "unknown tool: %s%s" % (key, hint)}
    try:
        return {"ok": True, "result": fn(**(args or {}))}
    except TypeError as e:
        return {"ok": False, "error": "bad args for %s: %s" % (key, e)}
    except Exception as e:
        return {"ok": False, "error": "%s: %s" % (type(e).__name__, e)}


def _find(coll, _id):
    for x in coll:
        if x.get("id") == _id:
            return x
    return None


def _safe_label(s):
    out = "".join(c if (c.isalnum()) else "_" for c in str(s or "X")).strip("_")
    return out or "X"


def _cell_to_world(level, x, y):
    w = level.get("w", 1) or 1
    h = level.get("h", 1) or 1
    return {"x": (x - w / 2.0) * WORLD_STEP, "y": (y - h / 2.0) * WORLD_STEP, "z": 0.0}


def _log(state, tool, args, result, ok=True):
    state["log"].insert(0, {
        "t": int(time.time() * 1000),
        "tool": tool,
        "args": {k: (v if not isinstance(v, (dict, list)) else "…") for k, v in (args or {}).items()},
        "ok": ok,
        "result": result if isinstance(result, (str, int, float, bool)) or result is None else "…",
    })
    del state["log"][200:]


# --------------------------------------------------------------------------
# register(api)
# --------------------------------------------------------------------------
def register(api):
    register_panel_rpcs(api)
    register_ui_tools(api)

    _ensure_state()

    # ---- listener helpers -------------------------------------------------
    def _listen(cmd, params=None):
        """Call the UEFN listener; return dict or {'error': ...}. Never raises."""
        try:
            res = api.listener(cmd, params or {})
            if isinstance(res, str):
                try:
                    res = json.loads(res)
                except Exception:
                    return {"raw": res}
            return res if isinstance(res, dict) else {"result": res}
        except Exception as e:
            return {"error": str(e)}

    def _content_root():
        info = _listen("get_project_info", {})
        return info.get("content_root") or info.get("contentRoot") or "/Game"

    def _spawn_actor(asset_path, label, folder, world, rot=None):
        """Spawn → label → folder → transform. Returns structured record."""
        warnings = []
        res = _listen("spawn_actor", {"asset_path": asset_path})
        if res.get("error"):
            return {"error": res["error"], "asset": asset_path, "label": label}
        path = res.get("actor_path") or res.get("path") or res.get("actor") or ""
        if not path:
            warnings.append("listener returned no actor_path")
        # organise: never leave actors at the Outliner root
        lr = _listen("set_actor_label", {"actor_path": path, "label": label})
        if lr.get("error"):
            warnings.append("label: " + lr["error"])
        fr = _listen("set_actor_folder", {"actor_path": path, "folder": folder})
        if fr.get("error"):
            warnings.append("folder: " + fr["error"])
        tr = _listen("set_actor_transform", {
            "actor_path": path,
            "location": [world["x"], world["y"], world["z"]],
            "rotation": rot or [0, 0, 0],
        })
        if tr.get("error"):
            warnings.append("transform: " + tr["error"])
        return {"actorPath": path, "label": label, "folder": folder, "world": world, "warnings": warnings}

    def _listener_online():
        r = _listen("ping", {})
        return not r.get("error")

    def _folder_for(level, sub):
        base = _safe_label(level.get("name", "Free")) if level else "Free"
        return base + "/" + sub

    def _sync_status():
        # Listener readiness only — actor "drift" is not a product signal (autosave + explicit Build).
        return {
            "inSync": True,
            "intended": 0,
            "sceneActors": len((_STATE.get("scene") or {}).get("actors") or []),
            "missing": 0,
            "extra": 0,
            "listener": (_STATE.get("scene") or {}).get("listener") or "unknown",
            "lastSync": (_STATE.get("scene") or {}).get("lastSync"),
        }

    # ======================================================================
    # SYNC BRIDGE (UI <-> plugin state) — keeps ONE source of truth
    # ======================================================================
    @api.tool()
    def rgd_get_state() -> dict:
        """Return the entire central design state (single source of truth)."""
        # Return a real dict — LazyState json-encodes as {} over MCP.
        return dict(_ensure_state())

    @api.tool()
    def rgd_replace_state(state: dict) -> dict:
        """Replace the whole design state and persist it — same write path as the panel."""
        payload = state if isinstance(state, dict) else {}
        merged = merge_defaults(payload)
        meta = merged.setdefault("meta", {})
        if isinstance(meta, dict):
            meta["savedAt"] = int((payload.get("meta") or {}).get("savedAt") or time.time() * 1000)
        _set_state(merged)
        return {"ok": True, "levels": len(_STATE["levels"]), "npcs": len(_STATE["npcs"])}

    @api.tool()
    def rgd_reload_store() -> dict:
        """Drop the in-memory cache and re-read <project>/.ducky/roguelike-design/store.json."""
        st = _reload_state_from_disk()
        theme = st.get("uiTheme") if isinstance(st, dict) else None
        return {
            "ok": True,
            "screens": len(st.get("uiScreens") or []) if isinstance(st, dict) else 0,
            "hasTheme": isinstance(theme, dict),
            "themeId": (theme or {}).get("id") if isinstance(theme, dict) else None,
        }

    # ======================================================================
    # READ TOOLS
    # ======================================================================
    @api.tool(intent=r"list levels|roguelike levels")
    def rgd_list_levels() -> list:
        """List all designed levels (id, name, size)."""
        return [{"id": l["id"], "name": l.get("name"), "w": l.get("w"), "h": l.get("h"),
                 "threat": l.get("threat")} for l in _STATE["levels"]]

    @api.tool()
    def rgd_get_level(level_id: str) -> dict:
        """Get one level including its full terrain/entity grid."""
        l = _find(_STATE["levels"], level_id)
        return l or {"error": "level not found: " + level_id}

    @api.tool(intent=r"list npcs|list enemies")
    def rgd_list_npcs() -> list:
        """List all NPCs / enemies (id, name, type)."""
        return [{"id": n["id"], "name": n.get("name"), "type": n.get("type")} for n in _STATE["npcs"]]

    @api.tool()
    def rgd_get_npc(npc_id: str) -> dict:
        """Get one NPC including base stats."""
        n = _find(_STATE["npcs"], npc_id)
        return n or {"error": "npc not found: " + npc_id}

    @api.tool(intent=r"list items|list loot")
    def rgd_list_items() -> list:
        """List all items / loot (id, name, category)."""
        return [{"id": i["id"], "name": i.get("name"), "category": i.get("category")} for i in _STATE["items"]]

    @api.tool()
    def rgd_get_item(item_id: str) -> dict:
        """Get one item including its stat modifiers."""
        i = _find(_STATE["items"], item_id)
        return i or {"error": "item not found: " + item_id}

    @api.tool()
    def rgd_list_currencies() -> list:
        """List currencies (id, name, symbol, startingAmount). Referenced by drops, NPC kill loot, and shop prices."""
        return [
            {
                "id": c["id"],
                "name": c.get("name"),
                "symbol": c.get("symbol"),
                "startingAmount": c.get("startingAmount", 0),
            }
            for c in _STATE.setdefault("currencies", [])
        ]

    @api.tool()
    def rgd_get_currency(currency_id: str) -> dict:
        """Return one currency record."""
        c = _find(_STATE.setdefault("currencies", []), currency_id)
        return c or {"error": "currency not found: " + currency_id}

    @api.tool()
    def rgd_list_stats() -> list:
        """List the global game stats (id, display name, default value)."""
        return list(_STATE["stats"])

    @api.tool()
    def rgd_get_scene_state() -> dict:
        """Return the live UEFN scene as last known to the plugin (spawned actors)."""
        _STATE["scene"]["listener"] = "online" if _listener_online() else "offline"
        _save(_STATE)
        return {"actors": _STATE["scene"]["actors"], "count": len(_STATE["scene"]["actors"]),
                "listener": _STATE["scene"]["listener"]}

    @api.tool()
    def rgd_get_sync_status() -> dict:
        """Compare intended placements (plugin state) vs actors in the scene; report drift."""
        _STATE["scene"]["listener"] = "online" if _listener_online() else "offline"
        s = _sync_status()
        _save(_STATE)
        return s

    # ======================================================================
    # WRITE TOOLS
    # ======================================================================
    @api.tool()
    def rgd_create_currency(
        id: str,
        name: str,
        symbol: str = "$",
        color: str = "#fbbf24",
        desc: str = "",
        starting_amount: float = 0,
    ) -> dict:
        """Create a currency. Use its id in item.currencyReward, npc.currencyDrop, and *.price."""
        if _find(_STATE.setdefault("currencies", []), id):
            return {"error": "currency exists: " + id}
        _STATE["currencies"].append({
            "id": id,
            "name": name,
            "symbol": (symbol[:2] if symbol else "$") or "$",
            "color": color,
            "desc": desc,
            "startingAmount": float(starting_amount or 0),
        })
        _save(_STATE)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_update_currency(
        id: str,
        name: str = None,
        symbol: str = None,
        color: str = None,
        desc: str = None,
        starting_amount: float = None,
    ) -> dict:
        """Update a currency's display fields / starting amount."""
        c = _find(_STATE.setdefault("currencies", []), id)
        if not c:
            return {"error": "currency not found: " + id}
        if name is not None:
            c["name"] = name
        if symbol is not None:
            c["symbol"] = symbol[:2] or c.get("symbol") or "$"
        if color is not None:
            c["color"] = color
        if desc is not None:
            c["desc"] = desc
        if starting_amount is not None:
            c["startingAmount"] = float(starting_amount)
        _save(_STATE)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_delete_currency(id: str) -> dict:
        """Delete a currency and strip it from drop rewards, NPC loot, and shop prices."""
        before = len(_STATE.setdefault("currencies", []))
        _STATE["currencies"] = [c for c in _STATE["currencies"] if c.get("id") != id]
        if len(_STATE["currencies"]) == before:
            return {"error": "currency not found: " + id}
        meta = _STATE.setdefault("meta", {})
        if not isinstance(meta, dict):
            meta = {}
            _STATE["meta"] = meta
        removed = meta.setdefault("removedCurrencyIds", [])
        if not isinstance(removed, list):
            removed = []
            meta["removedCurrencyIds"] = removed
        if id not in removed:
            removed.append(id)
        fallback = next(
            (c.get("id") for c in _STATE["currencies"] if c.get("id")),
            "gold",
        )
        for it in _STATE.get("items") or []:
            if isinstance(it.get("currencyReward"), dict):
                it["currencyReward"].pop(id, None)
            price = it.get("price")
            if isinstance(price, dict) and price.get("currencyId") == id:
                price["currencyId"] = fallback
                price["amount"] = 0
        for n in _STATE.get("npcs") or []:
            if isinstance(n.get("currencyDrop"), dict):
                n["currencyDrop"].pop(id, None)
        for w in _STATE.get("weapons") or []:
            price = w.get("price")
            if isinstance(price, dict) and price.get("currencyId") == id:
                price["currencyId"] = fallback
                price["amount"] = 0
        for p in _STATE.get("wizardry") or []:
            price = p.get("price")
            if isinstance(price, dict) and price.get("currencyId") == id:
                price["currencyId"] = fallback
                price["amount"] = 0
        _save(_STATE)
        return {"ok": True}

    def _prog() -> dict:
        p = _STATE.setdefault("progression", {})
        if not isinstance(p, dict):
            p = {}
            _STATE["progression"] = p
        tree = p.setdefault("tree", {"width": 900, "height": 520, "nodes": []})
        if not isinstance(tree, dict):
            p["tree"] = {"width": 900, "height": 520, "nodes": []}
            tree = p["tree"]
        tree.setdefault("nodes", [])
        if not isinstance(tree["nodes"], list):
            tree["nodes"] = []
        p.setdefault("scaling", [])
        p.setdefault("levelTable", [])
        p.setdefault("maxLevel", 30)
        p.setdefault("pointsPerLevel", 1)
        return p

    def _scale_at_level(row: dict, lv: int) -> float:
        base = float(row.get("base") or 0)
        per = float(row.get("perLevel") or 0)
        L = max(1, int(lv or 1))
        if (row.get("curve") or "linear") == "quad":
            return base + per * (L - 1) + 0.05 * per * (L - 1) * (L - 1)
        return base + per * (L - 1)

    @api.tool()
    def rgd_get_progression() -> dict:
        """Full progression block: levelTable (xp + points/level), scaling curves, skill tree nodes."""
        return _prog()

    @api.tool()
    @api.tool()
    def rgd_sync_skill_tree_ui() -> dict:
        """Rebuild the Skill Tree UI screen from Progression nodes (and refresh Level Up points copy)."""
        sync_skill_tree_ui(_STATE)
        _save(_STATE)
        scr = next((s for s in (_STATE.get("uiScreens") or []) if s.get("id") == "scr_skill_tree"), None)
        return {"ok": True, "widgets": (0 if not scr else 1), "nodes": len(((_STATE.get("progression") or {}).get("tree") or {}).get("nodes") or [])}

    @api.tool()
    def rgd_sync_armory_ui() -> dict:
        """Rebuild the Armory (scr_shop_weapons) UI screen from the Weapons list + wizardry join."""
        sync_armory_ui(_STATE)
        _save(_STATE)
        scr = next((s for s in (_STATE.get("uiScreens") or []) if s.get("id") == "scr_shop_weapons"), None)
        return {"ok": True, "widgets": (0 if not scr else 1), "weapons": len(_STATE.get("weapons") or [])}

    def rgd_list_skill_nodes() -> list:
        """List skill-tree nodes (id, name, requires, maxRank, cost, x, y)."""
        return [
            {
                "id": n.get("id"),
                "name": n.get("name"),
                "requires": list(n.get("requires") or []),
                "maxRank": n.get("maxRank", 1),
                "cost": n.get("cost", 1),
                "x": n.get("x"),
                "y": n.get("y"),
                "effect": n.get("effect"),
            }
            for n in (_prog().get("tree") or {}).get("nodes") or []
        ]

    @api.tool()
    def rgd_get_skill_node(node_id: str) -> dict:
        """Return one skill-tree node including desc, effect, statMods."""
        n = _find((_prog().get("tree") or {}).get("nodes") or [], node_id)
        return n or {"error": "skill node not found: " + node_id}

    @api.tool()
    def rgd_preview_scaling(level: int = 1) -> dict:
        """Preview HP/Damage/Defense (etc.) at a player level from progression.scaling curves."""
        lv = max(1, int(level or 1))
        rows = []
        for row in _prog().get("scaling") or []:
            now = _scale_at_level(row, lv)
            nxt = _scale_at_level(row, lv + 1)
            rows.append({
                "statId": row.get("statId"),
                "label": row.get("label") or row.get("statId"),
                "atLevel": round(now, 2),
                "nextLevelDelta": round(nxt - now, 2),
                "base": row.get("base"),
                "perLevel": row.get("perLevel"),
                "curve": row.get("curve") or "linear",
            })
        table = _prog().get("levelTable") or []
        points = sum(int(r.get("points") or 0) for r in table if int(r.get("level") or 0) <= lv)
        return {"level": lv, "cumulativeSkillPoints": points, "scaling": rows}

    @api.tool()
    def rgd_set_progression_curve(
        max_level: int = None,
        points_per_level: int = None,
        rebuild_table: bool = False,
    ) -> dict:
        """Set maxLevel / pointsPerLevel. Set rebuild_table=true to regenerate XP rows (keeps per-level point overrides when possible)."""
        p = _prog()
        if max_level is not None:
            p["maxLevel"] = max(1, min(200, int(max_level)))
        if points_per_level is not None:
            p["pointsPerLevel"] = max(0, int(points_per_level))
        if rebuild_table or not p.get("levelTable"):
            old = {int(r.get("level") or 0): r for r in (p.get("levelTable") or []) if isinstance(r, dict)}
            fresh = _progression_level_table(int(p.get("maxLevel") or 30), int(p.get("pointsPerLevel") or 1))
            for row in fresh:
                prev = old.get(int(row["level"]))
                if prev and prev.get("points") is not None:
                    row["points"] = prev["points"]
                if prev and prev.get("notes"):
                    row["notes"] = prev["notes"]
            p["levelTable"] = fresh
        _save(_STATE)
        return {"ok": True, "maxLevel": p["maxLevel"], "pointsPerLevel": p["pointsPerLevel"], "levels": len(p.get("levelTable") or [])}

    @api.tool()
    def rgd_set_level_points(level: int, points: int) -> dict:
        """Set skill points granted when reaching a specific player level."""
        p = _prog()
        row = next((r for r in (p.get("levelTable") or []) if int(r.get("level") or 0) == int(level)), None)
        if not row:
            return {"error": "level not in table: %s" % level}
        row["points"] = max(0, int(points))
        _save(_STATE)
        return {"ok": True, "level": int(level), "points": row["points"]}

    @api.tool()
    def rgd_set_scaling(scaling: list) -> dict:
        """Replace progression.scaling curves. Each row: {statId, label, base, perLevel, curve?}."""
        if not isinstance(scaling, list):
            return {"error": "scaling must be a list"}
        cleaned = []
        for row in scaling:
            if not isinstance(row, dict) or not row.get("statId"):
                continue
            cleaned.append({
                "statId": str(row["statId"]),
                "label": str(row.get("label") or row["statId"]),
                "base": float(row.get("base") or 0),
                "perLevel": float(row.get("perLevel") or 0),
                "curve": str(row.get("curve") or "linear"),
            })
        _prog()["scaling"] = cleaned
        _save(_STATE)
        return {"ok": True, "count": len(cleaned)}

    @api.tool()
    def rgd_create_skill_node(
        id: str,
        name: str,
        x: float = 120,
        y: float = 120,
        max_rank: int = 1,
        cost: int = 1,
        requires: list = None,
        icon: str = "sparkles",
        color: str = "#a855f7",
        desc: str = "",
        effect: str = "",
        stat_mods: dict = None,
    ) -> dict:
        """Add a skill-tree node. requires = list of prerequisite node ids (later nodes stay locked until those have rank ≥ 1)."""
        nodes = (_prog().get("tree") or {}).setdefault("nodes", [])
        if _find(nodes, id):
            return {"error": "skill node exists: " + id}
        nodes.append({
            "id": id,
            "name": name,
            "x": float(x),
            "y": float(y),
            "maxRank": max(1, int(max_rank or 1)),
            "cost": max(1, int(cost or 1)),
            "requires": list(requires or []),
            "icon": icon or "sparkles",
            "color": color or "#a855f7",
            "desc": desc or "",
            "effect": effect or "",
            "statMods": dict(stat_mods or {}),
        })
        sync_skill_tree_ui(_STATE)
        _save(_STATE)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_update_skill_node(
        id: str,
        name: str = None,
        x: float = None,
        y: float = None,
        max_rank: int = None,
        cost: int = None,
        requires: list = None,
        icon: str = None,
        color: str = None,
        desc: str = None,
        effect: str = None,
        stat_mods: dict = None,
    ) -> dict:
        """Update a skill-tree node (position, ranks, requires, text, statMods)."""
        n = _find((_prog().get("tree") or {}).get("nodes") or [], id)
        if not n:
            return {"error": "skill node not found: " + id}
        if name is not None:
            n["name"] = name
        if x is not None:
            n["x"] = float(x)
        if y is not None:
            n["y"] = float(y)
        if max_rank is not None:
            n["maxRank"] = max(1, int(max_rank))
        if cost is not None:
            n["cost"] = max(1, int(cost))
        if requires is not None:
            n["requires"] = list(requires)
        if icon is not None:
            n["icon"] = icon
        if color is not None:
            n["color"] = color
        if desc is not None:
            n["desc"] = desc
        if effect is not None:
            n["effect"] = effect
        if stat_mods is not None:
            n["statMods"] = dict(stat_mods)
        sync_skill_tree_ui(_STATE)
        _save(_STATE)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_delete_skill_node(id: str) -> dict:
        """Delete a skill-tree node and strip it from other nodes' requires lists."""
        tree = _prog().get("tree") or {}
        nodes = tree.get("nodes") or []
        before = len(nodes)
        tree["nodes"] = [n for n in nodes if n.get("id") != id]
        if len(tree["nodes"]) == before:
            return {"error": "skill node not found: " + id}
        for n in tree["nodes"]:
            n["requires"] = [r for r in (n.get("requires") or []) if r != id]
        sync_skill_tree_ui(_STATE)
        _save(_STATE)
        return {"ok": True}

    @api.tool()
    def rgd_create_stat(id: str, name: str, default: float = 0) -> dict:
        """Create a global stat. It becomes a field in NPC/Item editors and MCP data."""
        if _find(_STATE["stats"], id):
            return {"error": "stat exists: " + id}
        _STATE["stats"].append({"id": id, "name": name, "def": default})
        for n in _STATE["npcs"]:
            n.setdefault("stats", {}).setdefault(id, default)
        for it in _STATE["items"]:
            it.setdefault("stats", {}).setdefault(id, 0)
        _save(_STATE)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_update_stat(id: str, name: str = None, default: float = None) -> dict:
        """Update a global stat's display name and/or default value."""
        s = _find(_STATE["stats"], id)
        if not s:
            return {"error": "stat not found: " + id}
        if name is not None:
            s["name"] = name
        if default is not None:
            s["def"] = default
        _save(_STATE)
        return {"ok": True}

    @api.tool()
    def rgd_delete_stat(id: str) -> dict:
        """Delete a global stat and remove it from every NPC/Item."""
        _STATE["stats"] = [s for s in _STATE["stats"] if s["id"] != id]
        for n in _STATE["npcs"]:
            n.get("stats", {}).pop(id, None)
        for it in _STATE["items"]:
            it.get("stats", {}).pop(id, None)
        _save(_STATE)
        return {"ok": True}


    # ======================================================================
    # DROP TABLES (shared loot pools linked to NPCs)
    # ======================================================================
    @api.tool()
    def rgd_list_drop_tables() -> list:
        """List named drop tables (id, name, entryCount, linkedNpcCount)."""
        tables = _STATE.setdefault("dropTables", [])
        out = []
        for t in tables:
            tid = t.get("id")
            linked = sum(
                1
                for n in _STATE.get("npcs") or []
                if tid and tid in (n.get("dropTableIds") or [])
            )
            out.append({
                "id": tid,
                "name": t.get("name"),
                "color": t.get("color"),
                "desc": t.get("desc"),
                "entryCount": len(t.get("entries") or []),
                "linkedNpcCount": linked,
            })
        return out

    @api.tool()
    def rgd_get_drop_table(table_id: str) -> dict:
        """Return one drop table with full entries and linked NPC ids."""
        t = _find(_STATE.setdefault("dropTables", []), table_id)
        if not t:
            return {"error": "drop table not found: " + table_id}
        linked = [
            n["id"]
            for n in _STATE.get("npcs") or []
            if table_id in (n.get("dropTableIds") or [])
        ]
        return {**t, "linkedNpcIds": linked}

    @api.tool()
    def rgd_create_drop_table(
        id: str,
        name: str,
        color: str = "#94a3b8",
        desc: str = "",
        entries: list = None,
    ) -> dict:
        """Create a named drop table. entries = [{itemId, chance, weight, qtyMin, qtyMax, guaranteed}]."""
        from .defaults import normalize_drop_entries

        if _find(_STATE.setdefault("dropTables", []), id):
            return {"error": "drop table exists: " + id}
        _STATE["dropTables"].append({
            "id": id,
            "name": name,
            "color": color or "#94a3b8",
            "desc": desc or "",
            "entries": normalize_drop_entries(entries or []),
        })
        _save(_STATE)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_update_drop_table(
        id: str,
        name: str = None,
        color: str = None,
        desc: str = None,
        entries: list = None,
    ) -> dict:
        """Update a drop table. Pass entries to replace the full entry list."""
        from .defaults import normalize_drop_entries

        t = _find(_STATE.setdefault("dropTables", []), id)
        if not t:
            return {"error": "drop table not found: " + id}
        if name is not None:
            t["name"] = name
        if color is not None:
            t["color"] = color
        if desc is not None:
            t["desc"] = desc
        if entries is not None:
            t["entries"] = normalize_drop_entries(entries)
        _save(_STATE)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_delete_drop_table(id: str) -> dict:
        """Delete a drop table and detach it from all NPCs."""
        before = len(_STATE.setdefault("dropTables", []))
        _STATE["dropTables"] = [t for t in _STATE["dropTables"] if t.get("id") != id]
        if len(_STATE["dropTables"]) == before:
            return {"error": "drop table not found: " + id}
        for n in _STATE.get("npcs") or []:
            ids = n.get("dropTableIds")
            if isinstance(ids, list) and id in ids:
                n["dropTableIds"] = [x for x in ids if x != id]
        _save(_STATE)
        return {"ok": True}

    @api.tool()
    def rgd_attach_drop_table(npc_id: str, table_id: str) -> dict:
        """Attach a shared drop table to an NPC (no-op if already attached)."""
        n = _find(_STATE["npcs"], npc_id)
        if not n:
            return {"error": "npc not found: " + npc_id}
        if not _find(_STATE.setdefault("dropTables", []), table_id):
            return {"error": "drop table not found: " + table_id}
        ids = n.setdefault("dropTableIds", [])
        if not isinstance(ids, list):
            ids = []
            n["dropTableIds"] = ids
        if table_id not in ids:
            ids.append(table_id)
        _save(_STATE)
        return {"ok": True, "npc_id": npc_id, "dropTableIds": list(ids)}

    @api.tool()
    def rgd_detach_drop_table(npc_id: str, table_id: str) -> dict:
        """Detach a shared drop table from an NPC."""
        n = _find(_STATE["npcs"], npc_id)
        if not n:
            return {"error": "npc not found: " + npc_id}
        ids = n.get("dropTableIds") or []
        if isinstance(ids, list):
            n["dropTableIds"] = [x for x in ids if x != table_id]
        _save(_STATE)
        return {"ok": True, "npc_id": npc_id, "dropTableIds": list(n.get("dropTableIds") or [])}


    @api.tool()
    def rgd_create_npc(id: str, name: str, type: str = "Enemy", role: str = "",
                       symbol: str = "E", color: str = "#ef4444",
                       behavior: str = "Aggressive", stats: dict = None,
                       currency_drop: dict = None,
                       drop_table_ids: list = None,
                       bonus_drops: list = None) -> dict:
        """Create an NPC/enemy.

        type = Enemy | Elite | Boss | Friendly (Merchant/NPC/Ally fold into Friendly).
        role = Melee | Ranged | Caster | Charger | Support | Civilian.
        currency_drop = {currencyId: amount} granted on kill (ids from rgd_list_currencies).
        drop_table_ids = shared drop table ids (rgd_list_drop_tables).
        bonus_drops = per-enemy entries [{itemId, chance, weight, qtyMin, qtyMax, guaranteed}].
        Friendlies are people you talk to (Wizard Bob), not fight.
        """
        if _find(_STATE["npcs"], id):
            return {"error": "npc exists: " + id}
        from .defaults import (
            NPC_ROLES,
            _infer_npc_role,
            _normalize_npc_type,
            difficulty_triplet,
            normalize_drop_entries,
        )

        ntype = _normalize_npc_type(type)
        nrole = role if role in NPC_ROLES else _infer_npc_role(behavior, stats or {})
        if ntype == "Friendly" and not role and nrole == "Melee":
            nrole = "Civilian"
        base = {s["id"]: s["def"] for s in _STATE["stats"]}
        base.update(stats or {})
        weight = 2 if ntype == "Elite" else (5 if ntype == "Boss" else 1)
        _STATE["npcs"].append({
            "id": id, "name": name, "type": ntype, "role": nrole,
            "symbol": symbol[:1] or "E", "color": color, "behavior": behavior,
            "stats": base, "difficultyStats": difficulty_triplet(base, weight),
            "currencyDrop": dict(currency_drop or {}),
            "dropTableIds": [str(x) for x in (drop_table_ids or []) if x],
            "bonusDrops": normalize_drop_entries(bonus_drops or []),
        })
        _save(_STATE)
        return {"ok": True, "id": id, "type": ntype, "role": nrole}

    @api.tool()
    def rgd_update_npc(
        id: str,
        name: str = None,
        type: str = None,
        role: str = None,
        symbol: str = None,
        color: str = None,
        behavior: str = None,
        stats: dict = None,
        currency_drop: dict = None,
        drop_table_ids: list = None,
        bonus_drops: list = None,
    ) -> dict:
        """Update NPC fields including currency_drop, drop_table_ids, and bonus_drops."""
        from .defaults import NPC_ROLES, _normalize_npc_type, normalize_drop_entries

        n = _find(_STATE["npcs"], id)
        if not n:
            return {"error": "npc not found: " + id}
        if name is not None:
            n["name"] = name
        if type is not None:
            n["type"] = _normalize_npc_type(type)
        if role is not None:
            if role not in NPC_ROLES:
                return {"error": "role must be one of: " + ", ".join(NPC_ROLES)}
            n["role"] = role
        if symbol is not None:
            n["symbol"] = (symbol[:1] or n.get("symbol") or "E")
        if color is not None:
            n["color"] = color
        if behavior is not None:
            n["behavior"] = behavior
        if stats is not None:
            n["stats"] = stats
        if currency_drop is not None:
            n["currencyDrop"] = dict(currency_drop)
        if drop_table_ids is not None:
            n["dropTableIds"] = [str(x) for x in drop_table_ids if x]
        if bonus_drops is not None:
            n["bonusDrops"] = normalize_drop_entries(bonus_drops)
        _save(_STATE)
        return {"ok": True, "id": id, "type": n.get("type"), "role": n.get("role")}

    @api.tool()
    def rgd_delete_npc(id: str) -> dict:
        """Delete an NPC and remove it from all level grids."""
        _STATE["npcs"] = [n for n in _STATE["npcs"] if n["id"] != id]
        _strip_entity("npc", id)
        _save(_STATE)
        return {"ok": True}

    @api.tool()
    def rgd_create_item(id: str, name: str, category: str = "Health", symbol: str = "i",
                        color: str = "#22c55e", desc: str = "", stats: dict = None,
                        currency_reward: dict = None, price_currency_id: str = "gold",
                        price_amount: float = 0) -> dict:
        """Create a drop. stats = pickup modifiers; currency_reward = {currencyId: amount} on pickup;
        price_* = shop buy cost (currency ids from rgd_list_currencies)."""
        if _find(_STATE["items"], id):
            return {"error": "item exists: " + id}
        base = {s["id"]: 0 for s in _STATE["stats"]}
        base.update(stats or {})
        _STATE["items"].append({
            "id": id, "name": name, "category": category, "symbol": symbol[:1] or "i",
            "color": color, "desc": desc, "stats": base,
            "currencyReward": dict(currency_reward or {}),
            "price": {"currencyId": price_currency_id or "gold", "amount": float(price_amount or 0)},
        })
        _save(_STATE)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_update_item(
        id: str,
        name: str = None,
        category: str = None,
        symbol: str = None,
        color: str = None,
        desc: str = None,
        stats: dict = None,
        currency_reward: dict = None,
        price_currency_id: str = None,
        price_amount: float = None,
    ) -> dict:
        """Update a drop (name, category, symbol, color, desc, stats, currency_reward, price_*)."""
        it = _find(_STATE["items"], id)
        if not it:
            return {"error": "item not found: " + id}
        if name is not None:
            it["name"] = name
        if category is not None:
            it["category"] = category
        if symbol is not None:
            it["symbol"] = symbol[:1] or it.get("symbol") or "i"
        if color is not None:
            it["color"] = color
        if desc is not None:
            it["desc"] = desc
        if stats is not None:
            it["stats"] = stats
        if currency_reward is not None:
            it["currencyReward"] = dict(currency_reward)
        if price_currency_id is not None or price_amount is not None:
            price = it.setdefault("price", {"currencyId": "gold", "amount": 0})
            if not isinstance(price, dict):
                price = {"currencyId": "gold", "amount": 0}
                it["price"] = price
            if price_currency_id is not None:
                price["currencyId"] = price_currency_id
            if price_amount is not None:
                price["amount"] = float(price_amount)
        _save(_STATE)
        return {"ok": True}

    @api.tool()
    def rgd_delete_item(id: str) -> dict:
        """Delete an item and remove it from level grids, drop tables, and NPC bonus drops."""
        _STATE["items"] = [i for i in _STATE["items"] if i["id"] != id]
        _strip_entity("item", id)
        for t in _STATE.setdefault("dropTables", []):
            if isinstance(t, dict) and isinstance(t.get("entries"), list):
                t["entries"] = [e for e in t["entries"] if isinstance(e, dict) and e.get("itemId") != id]
        for n in _STATE.get("npcs") or []:
            if isinstance(n.get("bonusDrops"), list):
                n["bonusDrops"] = [e for e in n["bonusDrops"] if isinstance(e, dict) and e.get("itemId") != id]
        _save(_STATE)
        return {"ok": True}

    def _strip_entity(kind, _id):
        for l in _STATE["levels"]:
            grid = l.get("grid")
            if _is_sparse(grid):
                for k, c in list((grid.get("cells") or {}).items()):
                    e = (c or {}).get("entity")
                    if e and e.get("kind") == kind and e.get("id") == _id:
                        c = dict(c)
                        c["entity"] = None
                        if (c.get("terrain") or "empty") == "empty":
                            grid["cells"].pop(k, None)
                        else:
                            grid["cells"][k] = c
            elif isinstance(grid, list):
                for row in grid:
                    for c in row:
                        e = c.get("entity")
                        if e and e.get("kind") == kind and e.get("id") == _id:
                            c["entity"] = None


    def _overlays_dir():
        from .store_io import store_path
        d = store_path().parent / "overlays"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _default_overlay():
        return {"file": "", "opacity": 0.55, "enabled": False, "stretch": True}

    def _normalize_overlay(ov):
        base = _default_overlay()
        if isinstance(ov, dict):
            base.update({k: ov[k] for k in base if k in ov})
        return base

    @api.tool()
    def rgd_create_level(id: str, name: str, w: int = 16, h: int = 12,
                         theme: str = "#6366f1", threat: str = "Medium",
                         journey_id: str = "", journey: dict = None,
                         include: dict = None, layers: dict = None) -> dict:
        """Create a Level Gen target. Pass journey_id to select a catalogue Journey."""
        from .defaults import normalize_level

        if _find(_STATE["levels"], id):
            return {"error": "level exists: " + id}
        w, h = _clamp_dim(w), _clamp_dim(h)
        lvl = normalize_level({
            "id": id, "name": name, "w": w, "h": h, "theme": theme, "threat": threat,
            "grid": {"_sparse": True, "cells": {}},
            "overlay": _default_overlay(),
            "journeyId": journey_id or "",
            "journey": journey, "include": include, "layers": layers,
        })
        _STATE["levels"].append(lvl)
        _save(_STATE)
        return {"ok": True, "id": id, "level": lvl}

    @api.tool()
    def rgd_update_level(id: str, name: str = None, w: int = None, h: int = None,
                         theme: str = None, threat: str = None,
                         journey_id: str = None, journey: dict = None,
                         include: dict = None, layers: dict = None) -> dict:
        """Update level settings. Prefer journey_id (catalogue); include/layers for gen stamp."""
        from .defaults import normalize_level

        l = _find(_STATE["levels"], id)
        if not l:
            return {"error": "level not found: " + id}
        if name is not None:
            l["name"] = name
        if theme is not None:
            l["theme"] = theme
        if threat is not None:
            l["threat"] = threat
        if journey_id is not None:
            l["journeyId"] = journey_id
        if journey is not None:
            l["journey"] = journey
        if include is not None:
            l["include"] = include
        if layers is not None:
            l["layers"] = layers
        if w is not None or h is not None:
            nw = _clamp_dim(w if w is not None else l["w"])
            nh = _clamp_dim(h if h is not None else l["h"])
            l["grid"] = _make_grid(nw, nh, l["grid"])
            l["w"], l["h"] = nw, nh
        normalized = normalize_level(l)
        l.clear()
        l.update(normalized)
        _save(_STATE)
        return {"ok": True, "level": l}

    @api.tool()
    def rgd_list_journeys() -> list:
        """List catalogue Journeys (authored on Journeys tab; selected by Level Gen)."""
        from .defaults import migrate_journeys_catalogue, normalize_journey_record

        migrate_journeys_catalogue(_STATE)
        return [normalize_journey_record(j) for j in (_STATE.get("journeys") or []) if isinstance(j, dict)]

    @api.tool()
    def rgd_get_journey(journey_id: str) -> dict:
        """Get one catalogue Journey by id."""
        from .defaults import migrate_journeys_catalogue, normalize_journey_record

        migrate_journeys_catalogue(_STATE)
        j = _find(_STATE.get("journeys") or [], journey_id)
        return normalize_journey_record(j) if j else {"error": "journey not found: " + journey_id}

    @api.tool()
    def rgd_create_journey(id: str, name: str, journey: dict = None) -> dict:
        """Create a catalogue Journey (steps, enemies, rewards, loop)."""
        from .defaults import migrate_journeys_catalogue, normalize_journey_record

        migrate_journeys_catalogue(_STATE)
        if _find(_STATE.get("journeys") or [], id):
            return {"error": "journey exists: " + id}
        blob = dict(journey or {})
        blob["id"] = id
        blob["name"] = name
        rec = normalize_journey_record(blob)
        _STATE.setdefault("journeys", []).append(rec)
        _save(_STATE)
        return {"ok": True, "id": id, "journey": rec}

    @api.tool()
    def rgd_update_journey(id: str, journey: dict) -> dict:
        """Replace a catalogue Journey record."""
        from .defaults import migrate_journeys_catalogue, normalize_journey_record

        migrate_journeys_catalogue(_STATE)
        j = _find(_STATE.get("journeys") or [], id)
        if not j:
            return {"error": "journey not found: " + id}
        blob = dict(journey or {})
        blob["id"] = id
        rec = normalize_journey_record(blob)
        j.clear()
        j.update(rec)
        _save(_STATE)
        return {"ok": True, "journey": j}

    @api.tool()
    def rgd_delete_journey(id: str) -> dict:
        """Delete a catalogue Journey (clears journeyId on levels that used it)."""
        from .defaults import migrate_journeys_catalogue

        migrate_journeys_catalogue(_STATE)
        before = len(_STATE.get("journeys") or [])
        _STATE["journeys"] = [j for j in (_STATE.get("journeys") or []) if j.get("id") != id]
        if len(_STATE["journeys"]) == before:
            return {"error": "journey not found: " + id}
        for lvl in _STATE.get("levels") or []:
            if isinstance(lvl, dict) and lvl.get("journeyId") == id:
                lvl["journeyId"] = ""
        _save(_STATE)
        return {"ok": True}

    @api.tool()
    def rgd_delete_level(id: str) -> dict:
        """Delete a level from the design (does not clear the scene — call clear first)."""
        _STATE["levels"] = [l for l in _STATE["levels"] if l["id"] != id]
        _save(_STATE)
        return {"ok": True}

    @api.tool()
    def rgd_set_grid_cell(level_id: str, x: int, y: int, value: str,
                          entity_kind: str = None, entity_id: str = None) -> dict:
        """Paint one grid cell. value ∈ empty|floor|wall|door; or set an entity."""
        l = _find(_STATE["levels"], level_id)
        if not l:
            return {"error": "level not found"}
        if not (0 <= y < l["h"] and 0 <= x < l["w"]):
            return {"error": "out of bounds"}
        c = _get_cell(l, x, y)
        if entity_kind and entity_id:
            if c.get("terrain") == "empty":
                c["terrain"] = "floor"
            c["entity"] = {"kind": entity_kind, "id": entity_id}
        else:
            c["terrain"] = value
            if value == "empty":
                c["entity"] = None
        _set_cell(l, x, y, c)
        _save(_STATE)
        return {"ok": True}


    @api.tool(intent=r"overlay map image|set level overlay|map overlay")
    def rgd_set_level_overlay(level_id: str, image_path: str = "",
                              opacity: float = 0.55, enabled: bool = True,
                              stretch: bool = True, clear: bool = False) -> dict:
        """Overlay a reference map image on a level (stretched under the paint grid).

        Copies image_path into the project's .ducky/roguelike-design/overlays/
        folder and stores overlay settings on the level. Use clear=true to remove.
        Build on top of the image in the Levels tab — opacity/stretch adjustable.
        """
        l = _find(_STATE["levels"], level_id)
        if not l:
            return {"error": "level not found: " + level_id}
        if clear:
            l["overlay"] = _default_overlay()
            _save(_STATE)
            return {"ok": True, "level_id": level_id, "overlay": l["overlay"]}
        ov = _normalize_overlay(l.get("overlay"))
        ov["opacity"] = max(0.05, min(1.0, float(opacity)))
        ov["enabled"] = bool(enabled)
        ov["stretch"] = bool(stretch)
        if image_path:
            src = Path(image_path)
            if not src.is_file():
                return {"error": "image not found: " + image_path}
            ext = src.suffix.lower() or ".png"
            if ext not in (".png", ".jpg", ".jpeg", ".webp", ".bmp"):
                return {"error": "unsupported image type: " + ext}
            dest_name = f"{level_id}{ext}"
            dest = _overlays_dir() / dest_name
            shutil.copy2(src, dest)
            ov["file"] = dest_name
        elif not ov.get("file"):
            return {"error": "image_path required when level has no overlay file yet"}
        l["overlay"] = ov
        _save(_STATE)
        return {"ok": True, "level_id": level_id, "overlay": ov,
                "path": str(_overlays_dir() / ov["file"]) if ov.get("file") else ""}

    @api.tool()
    def rgd_get_level_overlay(level_id: str, include_data_url: bool = False) -> dict:
        """Read overlay settings for a level. Optionally include a data URL for the image."""
        l = _find(_STATE["levels"], level_id)
        if not l:
            return {"error": "level not found: " + level_id}
        ov = _normalize_overlay(l.get("overlay"))
        out = {"ok": True, "level_id": level_id, "overlay": ov}
        if include_data_url and ov.get("file"):
            p = _overlays_dir() / ov["file"]
            if p.is_file():
                mime = "image/png"
                ext = p.suffix.lower()
                if ext in (".jpg", ".jpeg"):
                    mime = "image/jpeg"
                elif ext == ".webp":
                    mime = "image/webp"
                raw = p.read_bytes()
                out["dataUrl"] = f"data:{mime};base64," + base64.b64encode(raw).decode("ascii")
                out["bytes"] = len(raw)
            else:
                out["missing_file"] = str(p)
        return out


    # ======================================================================
    # ACT TOOLS (mutate the live UEFN scene)
    # ======================================================================
    def _asset_for(level, kind):
        assets = dict(DEFAULT_ASSETS)
        if level and level.get("assets"):
            assets.update(level["assets"])
        return assets.get(kind, DEFAULT_ASSETS.get(kind))

    def _record(actor, kind, level_id, x, y, entity_id=None, geo=None):
        rec = {"path": actor.get("actorPath"), "label": actor.get("label"),
               "folder": actor.get("folder"), "kind": kind, "levelId": level_id,
               "x": x, "y": y, "world": actor.get("world"), "warnings": actor.get("warnings", [])}
        if entity_id:
            rec["entityId"] = entity_id
        if geo:
            rec["geo"] = geo
        _STATE["scene"]["actors"].append(rec)
        return rec

    def _dup(level_id, x, y, entity_id):
        for a in _STATE["scene"]["actors"]:
            if a["levelId"] == level_id and a["x"] == x and a["y"] == y and a.get("entityId") == entity_id:
                return a
        return None

    @api.tool(intent=r"spawn npc in uefn")
    def rgd_spawn_npc_in_uefn(npc_id: str, level_id: str = None, x: int = 0, y: int = 0) -> dict:
        """Spawn ONE NPC into the live scene at grid (x,y), labelled + foldered."""
        n = _find(_STATE["npcs"], npc_id)
        if not n:
            return {"error": "npc not found: " + npc_id}
        level = _find(_STATE["levels"], level_id) if level_id else None
        dup = _dup(level_id or "free", x, y, npc_id)
        if dup:
            return {"skipped": True, "reason": "already spawned", "actorPath": dup["path"]}
        world = _cell_to_world(level, x, y) if level else {"x": x * WORLD_STEP, "y": y * WORLD_STEP, "z": 0}
        label = _safe_label(n["name"]) + "_%d_%d" % (x, y)
        folder = _folder_for(level, "Enemies")
        actor = _spawn_actor(_asset_for(level, "npc"), label, folder, world)
        if actor.get("error"):
            _log(_STATE, "spawn_npc_in_uefn", {"npc_id": npc_id}, actor["error"], ok=False)
            _save(_STATE)
            return actor
        rec = _record(actor, "npc", level_id or "free", x, y, entity_id=npc_id)
        _STATE["scene"]["lastSync"] = int(time.time() * 1000)
        _log(_STATE, "spawn_npc_in_uefn", {"npc_id": npc_id}, rec["path"])
        _save(_STATE)
        return {"actorPath": rec["path"], "label": label, "folder": folder,
                "world": world, "warnings": actor.get("warnings", [])}

    @api.tool(intent=r"spawn item in uefn")
    def rgd_spawn_item_in_uefn(item_id: str, level_id: str = None, x: int = 0, y: int = 0) -> dict:
        """Spawn ONE item into the live scene at grid (x,y), labelled + foldered."""
        it = _find(_STATE["items"], item_id)
        if not it:
            return {"error": "item not found: " + item_id}
        level = _find(_STATE["levels"], level_id) if level_id else None
        dup = _dup(level_id or "free", x, y, item_id)
        if dup:
            return {"skipped": True, "reason": "already spawned", "actorPath": dup["path"]}
        world = _cell_to_world(level, x, y) if level else {"x": x * WORLD_STEP, "y": y * WORLD_STEP, "z": 0}
        label = _safe_label(it["name"]) + "_%d_%d" % (x, y)
        folder = _folder_for(level, "Loot")
        actor = _spawn_actor(_asset_for(level, "item"), label, folder, world)
        if actor.get("error"):
            _log(_STATE, "spawn_item_in_uefn", {"item_id": item_id}, actor["error"], ok=False)
            _save(_STATE)
            return actor
        rec = _record(actor, "item", level_id or "free", x, y, entity_id=item_id)
        _STATE["scene"]["lastSync"] = int(time.time() * 1000)
        _log(_STATE, "spawn_item_in_uefn", {"item_id": item_id}, rec["path"])
        _save(_STATE)
        return {"actorPath": rec["path"], "label": label, "folder": folder,
                "world": world, "warnings": actor.get("warnings", [])}

    @api.tool()
    def rgd_clear_level_in_uefn(level_id: str) -> dict:
        """Delete every actor the plugin spawned for this level (idempotent cleanup)."""
        paths = [a["path"] for a in _STATE["scene"]["actors"] if a["levelId"] == level_id and a["path"]]
        removed = 0
        for p in paths:
            r = _listen("delete_actors", {"actor_paths": [p]})
            if not r.get("error"):
                removed += 1
        _STATE["scene"]["actors"] = [a for a in _STATE["scene"]["actors"] if a["levelId"] != level_id]
        _log(_STATE, "clear_level_in_uefn", {"level_id": level_id}, removed)
        _save(_STATE)
        return {"removed": removed}

    @api.tool(intent=r"build level in uefn|build this level")
    def rgd_build_level_in_uefn(level_id: str) -> dict:
        """Realise a whole level in the live scene: walls, doors, and entities.
        Reconciles first (clears prior actors for this level) so rebuilds never
        double-spawn. Every actor is labelled + foldered under the level name."""
        level = _find(_STATE["levels"], level_id)
        if not level:
            return {"error": "level not found: " + level_id}
        if not _listener_online():
            _STATE["scene"]["listener"] = "offline"
            _save(_STATE)
            return {"error": "UEFN listener offline"}

        # reconcile (idempotent rebuild)
        rgd_clear_level_in_uefn(level_id)

        walls = doors = ents = 0
        warnings = []
        for x, y, c in _iter_painted(level):
            world = _cell_to_world(level, x, y)
            terr = c.get("terrain")
            if terr == "wall":
                a = _spawn_actor(_asset_for(level, "wall"), "Wall_%d_%d" % (x, y),
                                 _folder_for(level, "Geometry/Walls"), world)
                if a.get("error"):
                    warnings.append("wall %d,%d: %s" % (x, y, a["error"]))
                else:
                    _record(a, "geo", level_id, x, y, geo="wall")
                    walls += 1
            elif terr == "door":
                a = _spawn_actor(_asset_for(level, "door"), "Door_%d_%d" % (x, y),
                                 _folder_for(level, "Geometry/Doors"), world)
                if a.get("error"):
                    warnings.append("door %d,%d: %s" % (x, y, a["error"]))
                else:
                    _record(a, "geo", level_id, x, y, geo="door")
                    doors += 1
            ent = c.get("entity")
            if ent:
                coll = _STATE["npcs"] if ent["kind"] == "npc" else _STATE["items"]
                e = _find(coll, ent["id"])
                if not e:
                    warnings.append("missing entity %s @%d,%d" % (ent["id"], x, y))
                    continue
                label = _safe_label(e["name"]) + "_%d_%d" % (x, y)
                folder = _folder_for(level, "Enemies" if ent["kind"] == "npc" else "Loot")
                a = _spawn_actor(_asset_for(level, ent["kind"]), label, folder, world)
                if a.get("error"):
                    warnings.append("entity %s: %s" % (ent["id"], a["error"]))
                else:
                    _record(a, ent["kind"], level_id, x, y, entity_id=ent["id"])
                    ents += 1

        _STATE["scene"]["lastSync"] = int(time.time() * 1000)
        _STATE["scene"]["listener"] = "online"
        result = {"level": level["name"], "walls": walls, "doors": doors, "entities": ents,
                  "warnings": warnings,
                  "actors": len([a for a in _STATE["scene"]["actors"] if a["levelId"] == level_id])}
        _log(_STATE, "build_level_in_uefn", {"level_id": level_id}, result["actors"])
        _save(_STATE)
        return result

    @api.tool(intent=r"sync from uefn|pull scene")
    def rgd_sync_from_uefn(level_id: str = None) -> dict:
        """Pull the live scene back into the plugin state and refresh listener status."""
        online = _listener_online()
        _STATE["scene"]["listener"] = "online" if online else "offline"
        if not online:
            _save(_STATE)
            return {"error": "UEFN listener offline"}
        # Trust actors we spawned; annotate which are still present in the scene.
        actors = _listen("get_all_actors", {})
        live_paths = set()
        for a in (actors.get("actors") or actors.get("result") or []):
            p = a.get("path") if isinstance(a, dict) else a
            if p:
                live_paths.add(p)
        present = 0
        for a in _STATE["scene"]["actors"]:
            a["present"] = (a["path"] in live_paths) if live_paths else True
            if a.get("present"):
                present += 1
        _STATE["scene"]["lastSync"] = int(time.time() * 1000)
        _log(_STATE, "sync_from_uefn", {"level_id": level_id}, present)
        _save(_STATE)
        return {"pulled": len(_STATE["scene"]["actors"]), "present": present,
                "actors": _STATE["scene"]["actors"]}


    # ======================================================================
    # PLAYER WEAPONS
    # ======================================================================
    @api.tool(intent=r"list weapons|player weapons")
    def rgd_list_weapons() -> list:
        """List all player weapons (id, name, category, slot policy, uefn asset)."""
        _ensure_state()
        weapons = _STATE.setdefault("weapons", [])
        return [{"id": w["id"], "name": w.get("name"), "category": w.get("category"),
                 "slotPolicy": w.get("slotPolicy"), "fireIdentity": w.get("fireIdentity"),
                 "uefnAsset": w.get("uefnAsset"),
                 "powerSlots": len(w.get("powerSlots") or []),
                 "suggestedElements": w.get("suggestedElements") or []}
                for w in weapons]

    @api.tool()
    def rgd_get_weapon(weapon_id: str) -> dict:
        """Get one player weapon including upgrades and UEFN asset refs."""
        _ensure_state()
        w = _find(_STATE.setdefault("weapons", []), weapon_id)
        return w or {"error": "weapon not found: " + weapon_id}

    @api.tool()
    def rgd_create_weapon(id: str, name: str, category: str = "Pistol", symbol: str = "W",
                          color: str = "#3b82f6", desc: str = "",
                          fireIdentity: str = "", slotPolicy: str = "infusable",
                          powerSlots: list = None, suggestedElements: list = None,
                          lockedPowerId: str = "", starter: bool = False,
                          uefnAsset: str = "", uefnIcon: str = "", icon: str = "",
                          verseClass: str = "", upgrades: list = None,
                          stats: dict = None, price: dict = None) -> dict:
        """Create a player weapon with open/locked power slots and UEFN custom-weapon refs."""
        _ensure_state()
        if _find(_STATE.setdefault("weapons", []), id):
            return {"error": "weapon exists: " + id}
        slots = powerSlots
        if slots is None:
            if slotPolicy == "locked_power" and lockedPowerId:
                slots = [{
                    "id": "slot_signature", "index": 1, "kind": "locked", "accepts": [],
                    "rerollPolicy": "none", "lockedPowerId": lockedPowerId,
                    "equippedPowerId": lockedPowerId, "label": lockedPowerId,
                }]
            else:
                slots = [{
                    "id": "slot_element", "index": 1, "kind": "open",
                    "accepts": ["element_infusion", "charged"], "rerollPolicy": "hub",
                    "equippedPowerId": None, "label": "Element Infusion",
                }]
        rec = {
            "id": id, "name": name, "category": category, "symbol": (symbol[:1] or "W"),
            "color": color, "desc": desc, "fireIdentity": fireIdentity,
            "slotPolicy": slotPolicy, "powerSlots": slots,
            "suggestedElements": suggestedElements or [],
            "starter": bool(starter),
            "uefnAsset": uefnAsset, "uefnIcon": uefnIcon,
            "icon": icon or ("assets/weapons/%s.svg" % id),
            "verseClass": verseClass or ("weapon_" + id),
            "upgrades": upgrades or [],
            "stats": stats if isinstance(stats, dict) else {},
            "price": price if isinstance(price, dict) else {"currencyId": "gold", "amount": 0},
        }
        _STATE["weapons"].append(rec)
        sync_armory_ui(_STATE)
        _save(_STATE)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_update_weapon(id: str, fields: object = None, **kwargs) -> dict:
        """Update fields of a player weapon (name, upgrades, uefnAsset, icon, stats, etc.)."""
        _ensure_state()
        w = _find(_STATE.setdefault("weapons", []), id)
        if not w:
            return {"error": "weapon not found: " + id}
        patch: dict = {}
        # MCP host often sends a single JSON `fields` string / object.
        raw = fields
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = None
        if isinstance(raw, dict):
            patch.update(raw)
        patch.update({k: v for k, v in kwargs.items() if v is not None and k != "fields"})
        # Heal accidental nesting from older calls (weapon.fields.stats → weapon.stats).
        nested = w.get("fields")
        if isinstance(nested, dict):
            for k, v in nested.items():
                if k not in w or w.get(k) in (None, "", {}, []):
                    w[k] = v
            w.pop("fields", None)
        w.update({k: v for k, v in patch.items() if v is not None})
        sync_armory_ui(_STATE)
        _save(_STATE)
        return {"ok": True}

    @api.tool()
    def rgd_delete_weapon(id: str) -> dict:
        """Delete a player weapon from the design catalogue."""
        _ensure_state()
        _STATE["weapons"] = [w for w in _STATE.setdefault("weapons", []) if w["id"] != id]
        sync_armory_ui(_STATE)
        _save(_STATE)
        return {"ok": True}



    # ======================================================================
    # WIZARDRY (element powers / scrolls)
    # ======================================================================
    @api.tool(intent=r"list wizardry|list powers|element powers")
    def rgd_list_wizardry(element: str = None) -> list:
        """List wizardry powers (optionally filtered by element)."""
        _ensure_state()
        powers = _STATE.setdefault("wizardry", [])
        out = []
        for p in powers:
            if element and p.get("element") != element:
                continue
            out.append({
                "id": p["id"], "name": p.get("name"), "element": p.get("element"),
                "kind": p.get("kind"), "findable": p.get("findable"),
                "customItemId": p.get("customItemId"), "verseClass": p.get("verseClass"),
            })
        return out

    @api.tool()
    def rgd_get_wizardry(power_id: str) -> dict:
        """Get one wizardry power including scroll / verse refs."""
        _ensure_state()
        p = _find(_STATE.setdefault("wizardry", []), power_id)
        return p or {"error": "wizardry not found: " + power_id}

    @api.tool()
    def rgd_list_elements() -> list:
        """List element categories (Fire/Ice/Lightning/Void/Time) with stack/proc metadata."""
        _ensure_state()
        return list(_STATE.setdefault("elements", []))

    @api.tool()
    def rgd_create_wizardry(id: str, name: str, element: str = "Fire",
                            kind: str = "element_infusion", desc: str = "",
                            color: str = "#a855f7", symbol: str = "W",
                            stackName: str = "", stackThreshold: int = 5,
                            procName: str = "", procDesc: str = "",
                            chargedName: str = "", chargedDesc: str = "",
                            findable: bool = True, buyable: bool = True,
                            reusable: bool = True, customItemId: str = "",
                            uefnCustomItem: str = "", verseClass: str = "") -> dict:
        """Create a wizardry power (scroll). Findable scrolls can slot onto open weapon power slots."""
        _ensure_state()
        if _find(_STATE.setdefault("wizardry", []), id):
            return {"error": "wizardry exists: " + id}
        cid = customItemId or (("scroll_" + id) if findable else "")
        rec = {
            "id": id, "name": name, "element": element, "kind": kind, "desc": desc,
            "color": color, "symbol": (symbol[:1] or "W"),
            "stackName": stackName, "stackThreshold": stackThreshold,
            "procName": procName, "procDesc": procDesc,
            "chargedName": chargedName, "chargedDesc": chargedDesc,
            "findable": bool(findable), "buyable": bool(buyable), "reusable": bool(reusable),
            "customItemId": cid, "uefnCustomItem": uefnCustomItem,
            "verseClass": verseClass or ("wizardry_" + id), "category": "Wizardry",
        }
        _STATE["wizardry"].append(rec)
        # Auto-add reusable scroll item for findable powers
        if findable and cid and not _find(_STATE.setdefault("items", []), cid):
            zeros = {s["id"]: 0 for s in _STATE.get("stats", [])}
            _STATE["items"].append({
                "id": cid, "name": "Scroll: " + name, "category": "Wizardry Scroll",
                "symbol": rec["symbol"], "color": color,
                "desc": "Reusable scroll. Slot onto any open weapon power slot. " + desc,
                "stats": zeros, "wizardryId": id, "element": element,
                "reusable": True, "uefnCustomItem": uefnCustomItem,
                "verseClass": rec["verseClass"],
            })
        sync_armory_ui(_STATE)
        _save(_STATE)
        return {"ok": True, "id": id, "customItemId": cid}

    @api.tool()
    def rgd_update_wizardry(id: str, **fields) -> dict:
        """Update fields of a wizardry power."""
        _ensure_state()
        p = _find(_STATE.setdefault("wizardry", []), id)
        if not p:
            return {"error": "wizardry not found: " + id}
        p.update({k: v for k, v in fields.items() if v is not None})
        sync_armory_ui(_STATE)
        _save(_STATE)
        return {"ok": True}

    @api.tool()
    def rgd_delete_wizardry(id: str) -> dict:
        """Delete a wizardry power (does not remove already-looted scroll items)."""
        _ensure_state()
        _STATE["wizardry"] = [p for p in _STATE.setdefault("wizardry", []) if p["id"] != id]
        sync_armory_ui(_STATE)
        _save(_STATE)
        return {"ok": True}

    @api.tool()
    def rgd_equip_weapon_power(weapon_id: str, power_id: str, slot_index: int = 1) -> dict:
        """Equip a findable wizardry scroll onto an open weapon power slot (hub reroll)."""
        _ensure_state()
        w = _find(_STATE.setdefault("weapons", []), weapon_id)
        if not w:
            return {"error": "weapon not found: " + weapon_id}
        p = _find(_STATE.setdefault("wizardry", []), power_id)
        if not p:
            return {"error": "wizardry not found: " + power_id}
        if w.get("slotPolicy") == "locked_power":
            return {"error": "weapon has locked power slots — cannot equip scrolls"}
        if p.get("kind") == "locked_signature":
            return {"error": "locked signature powers cannot be equipped as scrolls"}
        slots = w.setdefault("powerSlots", [])
        target = None
        for s in slots:
            if int(s.get("index") or 0) == int(slot_index):
                target = s
                break
        if not target:
            return {"error": "power slot not found: index %d" % slot_index}
        if target.get("kind") == "locked":
            return {"error": "slot is locked"}
        accepts = target.get("accepts") or []
        if accepts and p.get("kind") not in accepts:
            return {"error": "slot does not accept kind: " + str(p.get("kind"))}
        target["equippedPowerId"] = power_id
        sync_armory_ui(_STATE)
        _save(_STATE)
        return {"ok": True, "weapon_id": weapon_id, "power_id": power_id, "slot_index": slot_index}


    @api.tool()
    def rgd_restore_previous_store(confirm: bool = False) -> dict:
        """Undo the last write to the design store by restoring store.prev.json.

        Every write keeps one previous copy, so a bad overwrite (from the panel or
        from a tool) can be rolled back. Call with confirm=false first to see what
        the snapshot holds before replacing the live design.
        """
        from .store_io import store_path
        from .panel_rpc import _painted_count

        prev = store_path().with_name("store.prev.json")
        if not prev.exists():
            return {"error": "no previous snapshot at %s" % prev}
        try:
            snap = json.loads(prev.read_text(encoding="utf-8"))
        except Exception as e:
            return {"error": "snapshot unreadable: %s" % e}
        summary = {
            "levels": len(snap.get("levels") or []),
            "npcs": len(snap.get("npcs") or []),
            "items": len(snap.get("items") or []),
            "painted_cells": _painted_count(snap),
            "saved_at": (snap.get("meta") or {}).get("savedAt"),
            "path": str(prev),
        }
        if not confirm:
            return {"ok": True, "preview": True, "snapshot": summary}
        _set_state(merge_defaults(snap))
        return {"ok": True, "restored": summary}

    # Chunk catalogue + procedural generation + layout build
    chunk_fns = register_chunk_tools(
        api,
        state=_STATE,
        save=_save,
        find=_find,
        listen=_listen,
        listener_online=_listener_online,
        cell_to_world=_cell_to_world,
        safe_label=_safe_label,
        log=_log,
        world_step=WORLD_STEP,
    )

    # Rebuild panel map on every register() so updates replace stale tool sets.
    _PANEL_TOOL_FNS.clear()
    _PANEL_TOOL_FNS.update(
        {k: v for k, v in locals().items() if k.startswith("rgd_") and callable(v)}
    )
    _PANEL_TOOL_FNS.update(chunk_fns)
    # Short aliases (panel sometimes strips rgd_)
    for k, v in list(_PANEL_TOOL_FNS.items()):
        if k.startswith("rgd_"):
            _PANEL_TOOL_FNS.setdefault(k[4:], v)
    api.register_panel_rpc("call_tool", call_tool)
    api.log(
        "[rgd] Roguelike Game Design Platform: %d MCP tools registered, %d reachable from the panel (per-project store: %s)"
        % (len(_PANEL_TOOL_FNS), len(_PANEL_TOOL_FNS), project_key())
    )
