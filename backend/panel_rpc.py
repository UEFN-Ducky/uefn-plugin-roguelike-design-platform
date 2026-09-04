"""Panel RPCs — sandbox-safe bridge between UI iframe and per-project store."""

from __future__ import annotations

import base64
import io
import re
from pathlib import Path
from typing import Any

from .store_io import project_key, store_path


def _seed():
    from .register import _seed as seed_fn

    return seed_fn()


def _ensure_state():
    from .register import _ensure_state as ensure

    return ensure()


def _set_state(state: dict[str, Any]) -> None:
    from .register import _set_state as setter

    setter(state)


def _overlays_dir() -> Path:
    d = store_path().parent / "overlays"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _find_level(level_id: str) -> dict[str, Any] | None:
    st = _ensure_state()
    return next((l for l in st.get("levels", []) if l.get("id") == level_id), None)


def _resolve_overlay_path(file_name: str) -> Path | None:
    if not file_name:
        return None
    p = _overlays_dir() / file_name
    if p.is_file():
        return p
    plugin_asset = Path(__file__).resolve().parents[1] / "assets" / "overlays" / file_name
    if plugin_asset.is_file():
        return plugin_asset
    return None


def _preview_data_url(src: Path, max_edge: int = 1600, quality: int = 82) -> tuple[str, int, int, int]:
    """Downscale large overlays so panel RPC / <img src> stay responsive."""
    from PIL import Image

    with Image.open(src) as im:
        im = im.convert("RGBA") if im.mode in ("P", "RGBA", "LA") else im.convert("RGB")
        w, h = im.size
        edge = max(w, h)
        if edge > max_edge:
            scale = max_edge / float(edge)
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
        # JPEG can't store alpha — composite on dark bg matching the grid stage
        if im.mode == "RGBA":
            bg = Image.new("RGB", im.size, (11, 15, 25))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        elif im.mode != "RGB":
            im = im.convert("RGB")
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=quality, optimize=True)
        raw = buf.getvalue()
    data_url = "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")
    return data_url, len(raw), im.size[0], im.size[1]


def get_project_key(**_kwargs: Any) -> dict[str, Any]:
    return {"ok": True, "key": project_key(), "store": str(store_path())}


def get_store(**_kwargs: Any) -> dict[str, Any]:
    # Always serve the on-disk store so agent/file edits win over a stale MCP cache.
    from .register import _reload_state_from_disk
    try:
        st = _reload_state_from_disk()
    except Exception:
        st = _ensure_state()
    return {"ok": True, "key": project_key(), "state": st}


def _painted_count(st: dict[str, Any] | None) -> int:
    """Count painted terrain/entity cells — reported back so the panel can prove a save landed."""
    n = 0
    for lvl in (st or {}).get("levels") or []:
        if not isinstance(lvl, dict):
            continue
        g = lvl.get("grid")
        if isinstance(g, dict) and g.get("_sparse"):
            n += len(g.get("cells") or {})
            continue
        if isinstance(g, list):
            for row in g:
                for c in row or []:
                    if isinstance(c, dict) and (
                        c.get("terrain") not in (None, "empty") or c.get("entity")
                    ):
                        n += 1
    return n


def _ensure_boss_defeated_screen(merged: dict[str, Any]) -> None:
    """Insert scr_boss_defeated if a stale panel save omitted it.

    Prefer a copy already on disk; otherwise clone scr_wave_banner and retarget.
    """
    import copy

    from .store_io import _read_file

    screens = merged.get("uiScreens")
    if not isinstance(screens, list):
        return
    if any(isinstance(s, dict) and s.get("id") == "scr_boss_defeated" for s in screens):
        return

    donor: dict[str, Any] | None = None
    for snap in (store_path(), store_path().with_name("store.prev.json")):
        for s in ((_read_file(snap) or {}).get("uiScreens") or []):
            if isinstance(s, dict) and s.get("id") == "scr_boss_defeated":
                donor = copy.deepcopy(s)
                break
        if donor:
            break
    if donor is None:
        wave = next((s for s in screens if isinstance(s, dict) and s.get("id") == "scr_wave_banner"), None)
        if not isinstance(wave, dict):
            return
        donor = copy.deepcopy(wave)
        donor["id"] = "scr_boss_defeated"
        donor["name"] = "Boss Defeated"
        donor["stage"] = "combat"
        donor["category"] = "overlay"
        donor["status"] = "design"
        donor["notes"] = "~3s after boss kill. Centre banner. No buttons — InputMode.None."
        donor["verse"] = {
            "folder": "GameDevices/Gameplay/Screens/Run",
            "file": "boss_defeated_canvas.verse",
            "klass": "boss_defeated_canvas",
        }
        root = donor.get("root")
        if isinstance(root, dict):
            kids = root.get("children") or []
            if kids and isinstance(kids[0], dict) and isinstance(kids[0].get("slot"), dict):
                kids[0]["slot"].update(
                    {"aMin": [0.5, 0.5], "aMax": [0.5, 0.5], "off": [0, 0, 900, 140], "align": [0.5, 0.5]}
                )

            def _walk(n: Any) -> None:
                if not isinstance(n, dict):
                    return
                if n.get("name") == "Banner bg" and isinstance(n.get("props"), dict):
                    n["props"]["h"] = 140
                    n["props"]["opacity"] = 0.9
                if n.get("bind") == "WaveText":
                    n["bind"] = "DefeatTitleText"
                    n["name"] = "Defeat title"
                    props = n.setdefault("props", {})
                    if isinstance(props, dict):
                        props.update(
                            {"text": "BOSS DEFEATED", "size": "h1", "color": "gold", "justify": "Center"}
                        )
                text = ""
                props = n.get("props")
                if isinstance(props, dict):
                    text = str(props.get("text") or "")
                if n.get("name") == "Banner sub" or ("ARMOURED" in text and not n.get("bind")):
                    n["bind"] = "BossNameText"
                    n["name"] = "Boss name"
                    props = n.setdefault("props", {})
                    if isinstance(props, dict):
                        props.update(
                            {"text": "SUN WUKONG", "size": "h2", "color": "text", "justify": "Center"}
                        )
                for c in n.get("children") or []:
                    _walk(c)

            _walk(root)
            i = 0

            def _ids(n: Any) -> None:
                nonlocal i
                if not isinstance(n, dict):
                    return
                if n.get("id"):
                    n["id"] = "w_bdef%d" % i
                    i += 1
                for c in n.get("children") or []:
                    _ids(c)

            _ids(root)

    idx = next((i for i, s in enumerate(screens) if isinstance(s, dict) and s.get("id") == "scr_boss_bar"), -1)
    if idx >= 0:
        screens.insert(idx + 1, donor)
    else:
        screens.append(donor)
    merged["uiScreens"] = screens


def set_store(state: dict[str, Any] | None = None, **_kwargs: Any) -> dict[str, Any]:
    """The one write path for design data — panel edits land here and nowhere else."""
    import importlib
    import time

    from . import defaults as defaults_mod
    from .store_io import _read_file

    # Hot-reload so a stale panel process always picks up new default NPCs (Wizard Bob)
    # and taxonomy fills, instead of writing an older catalogue over the project.
    defaults_mod = importlib.reload(defaults_mod)

    payload = state if isinstance(state, dict) else {}
    # Never persist ephemeral overlay data URLs into the project store
    for lvl in payload.get("levels") or []:
        if not isinstance(lvl, dict):
            continue
        ov = lvl.get("overlay")
        if isinstance(ov, dict) and "_dataUrl" in ov:
            ov = dict(ov)
            ov.pop("_dataUrl", None)
            lvl["overlay"] = ov

    # Union currency tombstones from disk before merge so a stale panel that still
    # lists Gold/Gems/Keys cannot resurrect currencies the designer already deleted.
    removed: set[str] = set()
    for snap in (store_path(), store_path().with_name("store.prev.json")):
        disk = _read_file(snap) or {}
        dmeta = disk.get("meta") if isinstance(disk.get("meta"), dict) else {}
        for x in dmeta.get("removedCurrencyIds") or []:
            if x:
                removed.add(str(x))
    pmeta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    for x in pmeta.get("removedCurrencyIds") or []:
        if x:
            removed.add(str(x))
    if removed:
        if not isinstance(payload.get("meta"), dict):
            payload["meta"] = {}
        payload["meta"]["removedCurrencyIds"] = sorted(removed)

    merged = defaults_mod.merge_defaults(payload)

    # Stale panel tabs can ship a shorter level list — keep any level already on disk
    # (or in the previous snapshot) that the payload omitted, so Training Room etc.
    # cannot vanish on a background save.
    disk_levels: dict[str, Any] = {}
    for snap in (store_path(), store_path().with_name("store.prev.json")):
        for l in ((_read_file(snap) or {}).get("levels") or []):
            if isinstance(l, dict) and l.get("id") and l["id"] not in disk_levels:
                disk_levels[l["id"]] = l
    merged_levels = {
        l["id"]: l for l in (merged.get("levels") or [])
        if isinstance(l, dict) and l.get("id")
    }
    order = [l["id"] for l in (merged.get("levels") or []) if isinstance(l, dict) and l.get("id")]
    for lid, lvl in disk_levels.items():
        if lid not in merged_levels:
            merged_levels[lid] = lvl
            order.append(lid)
    merged["levels"] = [merged_levels[i] for i in order if i in merged_levels]

    # Keep catalogue screens the panel seed added (e.g. scr_boss_defeated) when a
    # stale iframe still saves an older uiScreens list without them.
    _ensure_boss_defeated_screen(merged)

    meta = merged.setdefault("meta", {})
    if not isinstance(meta, dict):
        meta = {}
        merged["meta"] = meta
    if removed:
        meta["removedCurrencyIds"] = sorted(removed)
        merged["currencies"] = [
            c for c in (merged.get("currencies") or [])
            if isinstance(c, dict) and c.get("id") not in removed
        ]
    meta["savedAt"] = int((payload.get("meta") or {}).get("savedAt") or time.time() * 1000)
    _set_state(merged)
    return {"ok": True, "key": project_key(), "painted": _painted_count(merged)}


def get_overlay_image(level_id: str = "", max_edge: int = 1600, **_kwargs: Any) -> dict[str, Any]:
    """Return overlay settings + a *preview* data URL for the Levels paint grid.

    Full source files can be multi‑MB; the UI only needs a downscaled JPEG.
    """
    lvl = _find_level(level_id)
    if not lvl:
        return {"ok": False, "error": "level not found"}
    ov = lvl.get("overlay") or {}
    file_name = (ov.get("file") or "").strip()
    out: dict[str, Any] = {
        "ok": True,
        "overlay": {
            "file": file_name,
            "opacity": float(ov.get("opacity", 0.55)),
            "enabled": bool(ov.get("enabled", False)),
            "stretch": bool(ov.get("stretch", True)),
        },
        "dataUrl": "",
    }
    if not file_name:
        return out
    p = _resolve_overlay_path(file_name)
    if not p:
        out["missing_file"] = str(_overlays_dir() / file_name)
        return out
    try:
        data_url, nbytes, pw, ph = _preview_data_url(p, max_edge=max(256, int(max_edge or 1600)))
        out["dataUrl"] = data_url
        out["bytes"] = nbytes
        out["preview_w"] = pw
        out["preview_h"] = ph
        out["source_bytes"] = p.stat().st_size
    except Exception as e:
        # Fallback: only for tiny files; huge raw base64 breaks the panel bridge
        if p.stat().st_size <= 1_500_000:
            ext = p.suffix.lower()
            mime = "image/png"
            if ext in (".jpg", ".jpeg"):
                mime = "image/jpeg"
            elif ext == ".webp":
                mime = "image/webp"
            raw = p.read_bytes()
            out["dataUrl"] = f"data:{mime};base64," + base64.b64encode(raw).decode("ascii")
            out["bytes"] = len(raw)
        else:
            out["error"] = f"overlay preview failed: {e}"
    return out


_DATA_URL_RE = re.compile(r"^data:(image/[\w.+-]+);base64,(.+)$", re.DOTALL)


def _default_overlay() -> dict[str, Any]:
    return {"file": "", "opacity": 0.55, "enabled": False, "stretch": True}


def _normalize_overlay(ov: Any) -> dict[str, Any]:
    base = _default_overlay()
    if isinstance(ov, dict):
        for k in ("file", "opacity", "enabled", "stretch", "source_name"):
            if k in ov:
                base[k] = ov[k]
    return base


def save_overlay_image(
    level_id: str = "",
    data_url: str = "",
    file_name: str = "",
    opacity: float = 0.55,
    enabled: bool = True,
    stretch: bool = True,
    **_kwargs: Any,
) -> dict[str, Any]:
    """Persist a browser-picked overlay image into .ducky/.../overlays/ and wire the level."""
    from .register import _save, _STATE

    if not level_id:
        return {"ok": False, "error": "level_id required"}
    m = _DATA_URL_RE.match((data_url or "").strip())
    if not m:
        return {"ok": False, "error": "data_url required (data:image/...;base64,...)"}
    mime, b64 = m.group(1), m.group(2)
    try:
        raw = base64.b64decode(b64)
    except Exception:
        return {"ok": False, "error": "invalid base64 image"}
    if len(raw) < 32:
        return {"ok": False, "error": "image too small"}
    ext = ".png"
    if "jpeg" in mime or "jpg" in mime:
        ext = ".jpg"
    elif "webp" in mime:
        ext = ".webp"
    elif "bmp" in mime:
        ext = ".bmp"
    dest_name = f"{level_id}{ext}"
    friendly = (file_name or "").strip()
    dest = _overlays_dir() / dest_name
    dest.write_bytes(raw)

    st = _ensure_state()
    lvl = next((l for l in st.get("levels", []) if l.get("id") == level_id), None)
    if not lvl:
        # UI may load an image before create_level / set_store lands — keep the bytes
        # and a shell level so tab remounts can still resolve the overlay file.
        lvl = {
            "id": level_id,
            "name": level_id,
            "w": 16,
            "h": 12,
            "theme": "#6366f1",
            "threat": "Medium",
            "grid": [],
            "overlay": _default_overlay(),
        }
        st.setdefault("levels", []).append(lvl)

    ov = _normalize_overlay(lvl.get("overlay"))
    ov["file"] = dest_name
    ov["opacity"] = max(0.05, min(1.0, float(opacity)))
    ov["enabled"] = bool(enabled)
    ov["stretch"] = bool(stretch)
    if friendly:
        ov["source_name"] = Path(friendly).name
    lvl["overlay"] = ov
    # Sync lazy MCP state + disk
    try:
        live = _STATE._live() if hasattr(_STATE, "_live") else None
        if isinstance(live, dict):
            found = False
            for i, l in enumerate(live.get("levels", [])):
                if l.get("id") == level_id:
                    live["levels"][i] = lvl
                    found = True
                    break
            if not found:
                live.setdefault("levels", []).append(lvl)
        _save(live if isinstance(live, dict) else st)
    except Exception:
        from .store_io import write_store, read_store

        disk = read_store(lambda: st)
        found = False
        for i, l in enumerate(disk.get("levels", [])):
            if l.get("id") == level_id:
                disk["levels"][i]["overlay"] = ov
                found = True
                break
        if not found:
            disk.setdefault("levels", []).append(lvl)
        write_store(disk)
    return {
        "ok": True,
        "level_id": level_id,
        "overlay": {k: v for k, v in ov.items() if k != "_dataUrl"},
        "path": str(dest),
        "bytes": len(raw),
    }


def register_panel_rpcs(api: Any) -> None:
    api.register_panel_rpc("get_project_key", get_project_key)
    api.register_panel_rpc("get_store", get_store)
    api.register_panel_rpc("set_store", set_store)
    api.register_panel_rpc("get_overlay_image", get_overlay_image)
    api.register_panel_rpc("save_overlay_image", save_overlay_image)
    api.log("[rgd] panel RPCs registered")
