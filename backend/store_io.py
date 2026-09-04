"""Per-project persistence for Roguelike Design Platform.

State lives under ``<project>/.ducky/roguelike-design/store.json`` so each UEFN
island has its own NPCs, items, levels, and scene records. When no project is
open, falls back to AppData keyed by project slug. One-time migration copies
the legacy global ``state/store.json`` into the active project on first read.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from pathlib import Path
from typing import Any, Callable

_PLUGIN_DIR = Path(__file__).resolve().parents[1]
_LEGACY_FILE = _PLUGIN_DIR / "state" / "store.json"
_SUBDIR = ".ducky/roguelike-design"
_STORE_NAME = "store.json"


def _project_root() -> str:
    try:
        from frontend.settings import PanelSettings

        root = (PanelSettings.load().uefn_project_root or "").strip()
        if root:
            return root
    except Exception:
        pass
    return ""


def _slug_for_root(root: str) -> str:
    if not root:
        return "_no_project"
    try:
        from frontend.ui_web.project_chats import project_slug

        return project_slug(root)
    except Exception:
        name = os.path.basename(root.rstrip("\\/")) or "project"
        digest = hashlib.sha256(root.encode("utf-8")).hexdigest()[:16]
        return f"{name}_{digest}"


def project_key() -> str:
    return _slug_for_root(_project_root())


def store_path() -> Path:
    root = _project_root()
    if root:
        return Path(root) / _SUBDIR / _STORE_NAME
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or str(Path.home())
    return Path(base) / "UEFN-Ducky" / "roguelike_design_data" / project_key() / _STORE_NAME


def _read_file(path: Path) -> dict[str, Any] | None:
    try:
        if path.is_file():
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return raw
    except (OSError, json.JSONDecodeError):
        pass
    return None


def read_store(seed_fn: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    # Hot-reload catalogue defaults before merge so AppData plugin updates
    # (Egypt prefabPaths) apply without a full Ducky restart.
    import importlib

    from . import chunks as chunks_mod
    from . import defaults as defaults_mod

    importlib.reload(chunks_mod)
    importlib.reload(defaults_mod)
    from .defaults import merge_defaults

    path = store_path()
    data = _read_file(path)
    if data is not None:
        return merge_defaults(data)
    legacy = _read_file(_LEGACY_FILE)
    if legacy is not None and _project_root():
        merged = merge_defaults(legacy)
        try:
            write_store(merged)
        except OSError:
            pass
        return merged
    return seed_fn()


def write_store(data: dict[str, Any]) -> None:
    path = store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Keep the version we are about to replace, so one bad write is always undoable.
    # ponytail: single generation, oldest loss window is one write. Rotate N copies
    # if that turns out to be too shallow.
    if path.exists():
        try:
            shutil.copy2(path, path.with_name("store.prev.json"))
        except OSError:
            pass

    # Currency tombstones survive stale panel tabs that still list deleted defaults.
    # Union removedCurrencyIds from the on-disk store into the payload, then strip
    # those ids from currencies before persist — works even before panel_rpc reload.
    if isinstance(data, dict):
        removed: set[str] = set()
        prev = _read_file(path.with_name("store.prev.json")) or {}
        for snap in (prev, data):
            meta = snap.get("meta") if isinstance(snap.get("meta"), dict) else {}
            for x in meta.get("removedCurrencyIds") or []:
                if x:
                    removed.add(str(x))
        if removed:
            meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
            if not isinstance(data.get("meta"), dict):
                data["meta"] = meta = {}
            meta["removedCurrencyIds"] = sorted(removed)
            data["currencies"] = [
                c
                for c in (data.get("currencies") or [])
                if isinstance(c, dict) and c.get("id") not in removed
            ]

    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    os.replace(tmp, path)
