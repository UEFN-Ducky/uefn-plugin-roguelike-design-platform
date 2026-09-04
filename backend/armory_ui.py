"""Sync scr_shop_weapons from state.weapons (+ SCROLLS from buyable wizardry).

Keeps the UI Screens catalogue aligned with React ShopUI 1:1 when MCP mutates
weapons/powers. The panel JS does the same rebuild for live edits.
"""

from __future__ import annotations

from typing import Any


ARMORY_SCREEN_ID = "scr_shop_weapons"
PICKER_SCREEN_ID = "scr_armory_picker"
STAGE_W, STAGE_H = 1920, 1080
MX, MY = 120, 72
PAGE_SIZE = 6
CARD_W, CARD_H, GUTTER = 544, 398, 24
GRID_W = 1680
HEADER_H, TAB_H = 92, 56

FIXED_CATS = [
    {"id": "PISTOLS", "label": "PISTOLS", "weaponCat": "Pistol"},
    {"id": "ASSAULT RIFLES", "label": "ASSAULT RIFLES", "weaponCat": "Assault Rifle"},
    {"id": "SHOTGUNS", "label": "SHOTGUNS", "weaponCat": "Shotgun"},
    {"id": "SMGS", "label": "SMGS", "weaponCat": "SMG"},
    {"id": "SCROLLS", "label": "SCROLLS", "scrolls": True},
]

STAT_KEYS = [
    ("damage", ["damage", "dmg"]),
    ("accuracy", ["accuracy", "acc"]),
    ("range", ["range"]),
    ("mobility", ["mobility", "move", "speed"]),
    ("fire_rate", ["fire_rate", "firerate", "fire rate", "rate"]),
]
STAT_LABELS = {
    "damage": "Damage",
    "accuracy": "Accuracy",
    "range": "Range",
    "mobility": "Mobility",
    "fire_rate": "Fire Rate",
}

# Fallback when weapon.stats is empty (kept in sync with defaults.WEAPON_ARMORY_STATS).
BAR_DEFAULTS: dict[str, dict[str, int]] = {
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


def _uid(prefix: str, i: list[int]) -> str:
    i[0] += 1
    return "%s_%d" % (prefix, i[0])


def _slot(**kwargs) -> dict[str, Any]:
    base = {
        "aMin": [0, 0],
        "aMax": [0, 0],
        "off": [0, 0, 200, 80],
        "align": [0, 0],
        "z": 0,
        "stc": False,
        "h": "Fill",
        "v": "Fill",
        "pad": [0, 0, 0, 0],
        "dist": None,
    }
    base.update(kwargs)
    return base


def _node(type_: str, name: str, props: dict, slot: dict, children: list | None, counter: list[int], bind: str | None = None) -> dict:
    n = {
        "id": _uid("w", counter),
        "type": type_,
        "name": name,
        "slot": slot,
        "props": props or {},
        "children": children or [],
    }
    if bind:
        n["bind"] = bind
    return n


def _text(text: str, size: str, color: str, slot: dict, name: str, counter: list[int], **extra) -> dict:
    props = {
        "text": text, "size": size, "color": color, "opacity": extra.get("opacity", 1),
        "justify": extra.get("justify", "Left"), "shadow": False,
        "shadowColor": "#000000", "shadowOpacity": 0.6,
        "wrap": bool(extra.get("wrap")), "wrapWidth": extra.get("wrapWidth", 0),
    }
    if extra.get("fx"):
        props["fx"] = extra["fx"]
    return _node("text", name, props, slot, None, counter, bind=extra.get("bind"))


def _rect(color: str, w: int, h: int, slot: dict, name: str, counter: list[int], opacity: float = 1.0) -> dict:
    return _node("rect", name, {"color": color, "opacity": opacity, "w": w, "h": h}, slot, None, counter)


def _fill(l=0, t=0, r=0, b=0, z=0):
    return _slot(aMin=[0, 0], aMax=[1, 1], off=[l, t, r, b], align=[0, 0], z=z)


def _box(x, y, w, h, z=0):
    return _slot(aMin=[0, 0], aMax=[0, 0], off=[x, y, w, h], align=[0, 0], z=z)


def _band_top(h, y=0, z=0):
    return _slot(aMin=[0, 0], aMax=[1, 0], off=[0, y, 0, h], align=[0, 0], z=z)


def _sl(h="Fill", v="Fill", pad=None):
    return _slot(h=h, v=v, pad=pad or [0, 0, 0, 0])


def _cat_meta(cat_id: str) -> dict:
    for c in FIXED_CATS:
        if c["id"] == cat_id:
            return c
    return FIXED_CATS[0]


def _scroll_entries(state: dict) -> list[dict]:
    out = []
    curs = state.get("currencies") or []
    default_cur = curs[0]["id"] if curs and isinstance(curs[0], dict) else "gold"
    for p in state.get("wizardry") or []:
        if not isinstance(p, dict):
            continue
        if p.get("buyable") is False or p.get("findable") is False:
            continue
        price = p.get("price") or {"amount": int(p.get("cost") or 0), "currencyId": default_cur}
        out.append({
            "id": "scroll_" + str(p.get("id") or p.get("name") or "x"),
            "name": p.get("name") or p.get("id"),
            "desc": p.get("desc") or p.get("procDesc") or p.get("chargedDesc") or "",
            "category": "SCROLLS",
            "starter": bool(p.get("owned")),
            "color": p.get("color") or "#a855f7",
            "symbol": p.get("symbol") or "S",
            "uefnIcon": p.get("uefnIcon") or "",
            "price": price,
            "stats": p.get("stats"),
            "skins": p.get("skins") or [{"id": "default", "name": "Default", "color": p.get("color") or "#9ca3af"}],
            "upgrades": p.get("upgrades") or [],
            "_scroll": True,
        })
    return out


def _entries(state: dict) -> list[dict]:
    weapons = []
    for w in state.get("weapons") or []:
        if isinstance(w, dict):
            e = dict(w)
            e["_scroll"] = False
            weapons.append(e)
    return weapons + _scroll_entries(state)


def _filter(entries: list, category: str) -> list:
    meta = _cat_meta(category)
    if meta.get("scrolls"):
        return [e for e in entries if e.get("_scroll") or e.get("category") == "SCROLLS"]
    wc = meta.get("weaponCat") or "Pistol"
    return [e for e in entries if not e.get("_scroll") and (e.get("category") or "Pistol") == wc]


def _norm_pct(raw: Any) -> float:
    try:
        v = float(raw or 0)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, v / 100.0 if v > 1 else v))


def _resolved_stats(w: dict) -> dict[str, Any]:
    raw = w.get("stats") if isinstance(w.get("stats"), dict) else {}
    # Heal MCP nesting: weapon.fields.stats
    nested = w.get("fields") if isinstance(w.get("fields"), dict) else {}
    if isinstance(nested.get("stats"), dict) and not raw:
        raw = nested.get("stats") or {}
    out = {k: v for k, v in raw.items() if v is not None and v != ""}
    if out:
        return out
    wid = str(w.get("id") or "")
    if wid in BAR_DEFAULTS:
        return dict(BAR_DEFAULTS[wid])
    cat = str(w.get("category") or "Pistol")
    if cat == "Assault Rifle":
        return {"damage": 62, "accuracy": 75, "range": 72, "mobility": 48, "fire_rate": 70}
    if cat == "Shotgun":
        return {"damage": 80, "accuracy": 48, "range": 28, "mobility": 45, "fire_rate": 35}
    if cat == "SMG":
        return {"damage": 52, "accuracy": 58, "range": 46, "mobility": 82, "fire_rate": 88}
    if w.get("_scroll"):
        return {"damage": 40, "accuracy": 50, "range": 45, "mobility": 55, "fire_rate": 60}
    return {"damage": 50, "accuracy": 60, "range": 50, "mobility": 55, "fire_rate": 55}


def _stat_label(key: str, stats_cat: list) -> str:
    if key in STAT_LABELS:
        return STAT_LABELS[key]
    for s in stats_cat:
        if isinstance(s, dict) and str(s.get("id") or "") == key and s.get("name"):
            return str(s["name"])
    return str(key or "Stat").replace("_", " ").title()


def _cat_hit(nm: str, sid: str, labels: list[str]) -> bool:
    # Exact only — substring matches steal bars (e.g. "attack" ⊂ "Attack Range").
    for l in labels:
        if nm == l or sid == l or nm == l.replace("_", " ") or sid == l.replace(" ", "_"):
            return True
    return False


def _stat_rows(w: dict, stats_cat: list) -> list[tuple[str, str, float]]:
    resolved = _resolved_stats(w or {})
    rows: list[tuple[str, str, float]] = []
    used: set[str] = set()
    for key, labels in STAT_KEYS:
        pct = None
        if resolved.get(key) is not None and resolved.get(key) != "":
            pct = _norm_pct(resolved.get(key))
        if pct is None:
            for l in labels:
                if resolved.get(l) is not None and resolved.get(l) != "":
                    pct = _norm_pct(resolved.get(l))
                    break
        if pct is None:
            for s in stats_cat:
                if not isinstance(s, dict):
                    continue
                nm = str(s.get("name") or "").lower()
                sid = str(s.get("id") or "").lower()
                if _cat_hit(nm, sid, labels + [key]):
                    if resolved.get(s.get("id")) is not None and resolved.get(s.get("id")) != "":
                        pct = _norm_pct(resolved.get(s.get("id")))
                        break
        if pct is None:
            continue
        rows.append((key, STAT_LABELS.get(key, _stat_label(key, stats_cat)), pct))
        used.add(key)
        used.update(labels)
    for k, v in resolved.items():
        lk = str(k).lower()
        if k in used or lk in used:
            continue
        if any(lk == key or lk in labels for key, labels in STAT_KEYS):
            continue
        rows.append((str(k), _stat_label(str(k), stats_cat), _norm_pct(v)))
    return rows or [("damage", "Damage", 0.0)]


def _desc_text(w: dict | None) -> str:
    if not w:
        return "No description yet."
    d = str(w.get("desc") or w.get("fireIdentity") or "").strip()
    return d or "No description yet."


def _card_slot_plate(w: dict, counter: list[int], wiz_by_id: dict) -> dict:
    slots = w.get("powerSlots") if isinstance(w.get("powerSlots"), list) else []
    slot = slots[0] if slots else {"kind": "open", "label": "Element Infusion"}
    pid = slot.get("equippedPowerId") or slot.get("lockedPowerId")
    wiz = wiz_by_id.get(pid) if pid else None
    empty = not wiz and slot.get("kind") != "locked"
    locked_sig = slot.get("kind") == "locked" or w.get("slotPolicy") == "locked_power"
    status = "EMPTY" if empty else ("LOCKED" if locked_sig else "FULL")
    title = (slot.get("label") or "Power slot") if empty else ((wiz or {}).get("name") or slot.get("label") or "Power")
    accent = "stroke" if empty else ((wiz or {}).get("color") or w.get("color") or "gold")
    return _node("overlay", "Card power slot", {}, _sl(h="Center", v="Center", pad=[0, 28, 0, 0]), [
        _rect(accent, 220, 72, _sl(), "Slot plate border", counter),
        _rect("panelDeep", 216, 68, _sl(pad=[2, 2, 2, 2]), "Slot plate fill", counter, opacity=0.95),
        _text("SLOT · " + status, "tiny", accent, _sl(h="Center", v="Top", pad=[0, 12, 0, 0]), "Slot status", counter, justify="Center"),
        _text(str(title), "small", "text", _sl(h="Center", v="Bottom", pad=[0, 0, 0, 12]), "Slot title", counter, justify="Center"),
    ], counter)


def _card(w: dict, index: int, i: int, counter: list[int], wiz_by_id: dict | None = None) -> dict:
    owned = bool(w.get("starter"))
    col, row = i % 3, i // 3
    x = col * (CARD_W + GUTTER)
    y = row * (CARD_H + GUTTER)
    accent = w.get("color") or "stroke"
    title = w.get("name") or w.get("id") or "?"
    body = _desc_text(w)
    kids = [
        _rect(accent, CARD_W, CARD_H, _sl(), "Card border", counter),
        _rect("panel", CARD_W - 4, CARD_H - 4, _sl(pad=[2, 2, 2, 2]), "Card fill", counter, opacity=0.75 if not owned else 0.97),
        _rect(accent, CARD_W - 4, 6, _sl(v="Top", pad=[2, 2, 2, 0]), "Card rarity bar", counter),
        _rect("panelDeep", CARD_W - 8, CARD_H - 120, _sl(v="Top", pad=[4, 10, 4, 0]), "Art plate", counter),
        _card_slot_plate(w, counter, wiz_by_id or {}),
        _text(title, "h3", "text", _sl(h="Left", v="Bottom", pad=[16, 0, 16, 40]), "Card title", counter),
        _text(body, "tiny", "textDim", _sl(h="Left", v="Bottom", pad=[16, 0, 16, 14]), "Card body", counter, wrap=True, wrapWidth=CARD_W - 40),
        _text("UNLOCKED" if owned else "LOCKED", "tiny", "accent" if owned else "danger", _sl(h="Right", v="Top", pad=[0, 18, 14, 0]), "Badge text", counter),
        _text("IN INVENTORY" if owned else "", "tiny", "accent", _sl(h="Left", v="Bottom", pad=[16, 0, 16, 14]), "Owned label", counter),
    ]
    card = _node("overlay", "Card · " + title, {
        "asButton": True, "variant": "card",
        "state": "locked" if not owned else "normal",
        "fx": "pad", "fxIndex": i, "collapseDefault": True,
    }, _box(x, y, CARD_W, CARD_H), kids, counter, bind="WeaponCard_" + str(w.get("id") or i))
    return card


def _build_root(state: dict[str, Any]) -> dict:
    counter = [0]
    entries = _entries(state)
    meta = state.setdefault("meta", {})
    cats = [c["id"] for c in FIXED_CATS]
    active = meta.get("armoryCategory") or "PISTOLS"
    if active not in cats:
        active = "PISTOLS"
    meta["armoryCategory"] = active
    filtered = _filter(entries, active)
    sel_id = meta.get("armorySelected")
    sel = next((w for w in entries if w.get("id") == sel_id), None) or (filtered[0] if filtered else (entries[0] if entries else None))
    if sel:
        meta["armorySelected"] = sel.get("id")
    page = max(0, int(meta.get("armoryPage") or 0))
    page_count = max(1, (max(len(filtered), 1) + PAGE_SIZE - 1) // PAGE_SIZE)
    if page >= page_count:
        page = page_count - 1
    meta["armoryPage"] = page
    stats_cat = list(state.get("stats") or [])

    header = _node("overlay", "Header band", {"collapseDefault": True}, _band_top(HEADER_H, 0, 5), [
        _rect("panelDeep", STAGE_W, HEADER_H, _sl(), "Header bg", counter, opacity=0.96),
        _text("Armory", "h1", "text", _sl(h="Left", v="Center", pad=[MX, 0, 0, 0]), "Armory title", counter),
        _text("1,240", "small", "text", _sl(h="Right", v="Center", pad=[0, 0, MX + 120, 0]), "Wallet sand", counter, bind="SandText"),
        _text("86", "small", "text", _sl(h="Right", v="Center", pad=[0, 0, MX, 0]), "Wallet essence", counter, bind="EssenceText"),
    ], counter)

    tab_w = max(1, STAGE_W // max(1, len(cats)))
    tab_kids = []
    for i, c in enumerate(cats):
        label = _cat_meta(c)["label"]
        active_tab = c == active
        tab = _node("overlay", "Tab · " + label, {
            "asButton": True, "variant": "quiet",
            "state": "selected" if active_tab else "normal",
        }, _sl(h="Left", v="Fill"), [
            _rect("panelAlt" if active_tab else "panelDeep", tab_w, TAB_H, _sl(), "Tab bg", counter),
            _text(label, "small", "text" if active_tab else "textMute", _sl(h="Center", v="Center"), "Tab label", counter),
        ], counter, bind="Tab" + "".join(ch for ch in c if ch.isalnum()))
        tab_kids.append(tab)
    tabs = _node("stack", "Tab strip", {"orient": "H", "collapseDefault": True}, _band_top(TAB_H, HEADER_H, 5), tab_kids, counter)

    wiz_by_id = {p["id"]: p for p in (state.get("wizardry") or []) if isinstance(p, dict) and p.get("id")}
    page_layers = []
    for p in range(page_count):
        slice_ = filtered[p * PAGE_SIZE:(p + 1) * PAGE_SIZE]
        grid_kids = [_card(slice_[i], p * PAGE_SIZE + i, i, counter, wiz_by_id) for i in range(len(slice_))]
        grid_h = CARD_H * 2 + GUTTER
        grid = _node("canvas", "Weapon grid", {"collapseDefault": True},
                     _box((STAGE_W - GRID_W) // 2, HEADER_H + TAB_H + 24, GRID_W, grid_h), grid_kids, counter)
        layer_kids = [grid]
        if page_count > 1:
            layer_kids.append(_node("overlay", "Pager", {}, _box((STAGE_W - GRID_W) // 2, HEADER_H + TAB_H + 24 + grid_h + 16, GRID_W, 48), [
                _text("PREV", "small", "text", _sl(h="Left", v="Center"), "Prev", counter, bind="PagerPrev"),
                _text("PAGE %d / %d" % (p + 1, page_count), "small", "textMute", _sl(h="Center", v="Center"), "Pager label", counter, bind="PagerLabel"),
                _text("NEXT", "small", "text", _sl(h="Right", v="Center"), "Next", counter, bind="PagerNext"),
            ], counter))
        layer = _node("canvas", "Page · %d" % (p + 1), {
            "view": {"group": "page", "id": str(p), "initial": p == page, "label": "Page %d" % (p + 1)},
            "collapseDefault": True,
        }, _fill(z=2), layer_kids, counter)
        page_layers.append(layer)

    for c in cats:
        marker = _rect("bg", 1, 1, _box(-20, -20, 1, 1), "ViewCat · " + c, counter, opacity=0)
        marker["props"]["view"] = {"group": "category", "id": c, "initial": c == active, "label": c}
        page_layers.append(marker)

    listing = _node("canvas", "Listing host", {
        "view": {"group": "mode", "id": "listing", "initial": True, "label": "Listing"},
        "collapseDefault": True,
        "modeSlide": "listing",
        "fx": "slideList",
    }, _fill(z=2), [tabs] + page_layers, counter)

    owned = bool((sel or {}).get("starter"))
    price = ((sel or {}).get("price") or {})
    amount = int(price.get("amount") or 0)
    wiz_by = {p.get("id"): p for p in (state.get("wizardry") or []) if isinstance(p, dict) and p.get("id")}
    power_slots = list((sel or {}).get("powerSlots") or [])
    if (sel or {}).get("_scroll"):
        wiz_id = (sel or {}).get("_wizId") or str((sel or {}).get("id") or "").replace("scroll_", "", 1)
        power_slots = [{"id": "scroll", "kind": "open", "equippedPowerId": wiz_id, "label": (sel or {}).get("name") or "Scroll"}]
    if not power_slots:
        power_slots = [
            {"id": "slot_element", "kind": "open", "accepts": ["element_infusion", "charged"], "equippedPowerId": None, "label": "Element Infusion"},
            {"id": "slot_charged", "kind": "open", "accepts": ["charged", "element_infusion"], "equippedPowerId": None, "label": "Charged Scroll"},
        ]
    power_slots = power_slots[:2]
    power_heading = "SCROLL POWER" if (sel or {}).get("_scroll") else "POWER SLOTS"
    power_kids = []
    for si, slot in enumerate(power_slots):
        pid = slot.get("equippedPowerId") or slot.get("lockedPowerId")
        wiz = wiz_by.get(pid) if pid else None
        title = (wiz or {}).get("name") or slot.get("label") or ("Open slot" if not pid else str(pid))
        kicker = (wiz or {}).get("element") or ("LOCKED" if slot.get("kind") == "locked" else ("EMPTY" if not pid else "POWER"))
        if wiz:
            effect = wiz.get("desc") or wiz.get("chargedDesc") or wiz.get("procDesc") or ""
        elif slot.get("kind") == "locked":
            effect = "Signature — cannot swap"
        else:
            effect = "Tap to equip · picker"
        accent = (wiz or {}).get("color") or ("gold" if slot.get("kind") == "locked" else "stroke")
        power_kids.append(_node("overlay", "Power slot · " + title, {
            "asButton": True, "variant": "card",
            "state": "selected" if si == 0 else ("locked" if slot.get("kind") == "locked" else "normal"),
            "collapseDefault": True,
        }, _sl(h="Left", v="Fill", pad=[16 if si else 0, 0, 0, 0]), [
            _rect(accent, 248, 128, _sl(), "Power border", counter),
            _rect("panelDeep", 244, 124, _sl(pad=[2, 2, 2, 2]), "Power fill", counter, opacity=0.95),
            _text(str(kicker), "tiny", accent, _sl(h="Left", v="Top", pad=[12, 12, 0, 0]), "Power kicker", counter),
            _text(str(title), "small", "text", _sl(h="Left", v="Top", pad=[12, 36, 0, 0]), "Power title", counter),
            _text(str(effect)[:80], "tiny", "textDim", _sl(h="Left", v="Top", pad=[12, 64, 12, 0]), "Power effect", counter, wrap=True, wrapWidth=220),
        ], counter, bind="PowerSlot_%d" % si))

    color = (sel or {}).get("color") or "#9ca3af"
    skin_list = (sel or {}).get("skins") or []
    if len(skin_list) < 4:
        skin_list = [
            {"id": "default", "name": "Default", "color": color},
            {"id": "midnight", "name": "Midnight", "color": "#6366f1"},
            {"id": "ember", "name": "Ember", "color": "#ef4444"},
            {"id": "glacier", "name": "Glacier", "color": "#38bdf8"},
        ]
    skin_kids = []
    for si, sk in enumerate(skin_list[:4]):
        skin_kids.append(_node("overlay", "Skin · " + str(sk.get("name") or "Default"), {
            "asButton": True, "variant": "card", "state": "selected" if si == 0 else "normal", "collapseDefault": True,
        }, _sl(h="Left", v="Fill", pad=[16 if si else 0, 0, 0, 0]), [
            _rect("accent" if si == 0 else "stroke", 96, 64, _sl(), "Skin border", counter),
            _text(str(sk.get("name") or "Default"), "tiny", "textMute", _sl(h="Center", v="Center"), "Skin label", counter, justify="Center"),
        ], counter, bind="Skin_%d" % si))

    desc = _desc_text(sel)
    desc_h = max(140, min(260, 48 + ((len(desc) + 33) // 34) * 22))
    stat_rows = []
    for key, label, pct in _stat_rows(sel or {}, stats_cat):
        bar_w = max(8, int(214 * pct))
        bind_key = "".join(ch if ch.isalnum() else "_" for ch in key)
        stat_rows.append(_node("overlay", "Stat · " + label, {"fx": "bar", "collapseDefault": True}, _sl(v="Top", pad=[0, 0, 0, 10]), [
            _text(label, "tiny", "textMute", _sl(h="Left", v="Center"), "Stat label", counter),
            _rect("accent", bar_w, 10, _sl(h="Right", v="Center"), "Stat bar", counter),
        ], counter, bind="Stat_" + bind_key))

    action_label = "Equip Weapon" if owned else ("Unlock for %d" % amount)
    details = _node("canvas", "Details · " + ((sel or {}).get("name") or "empty"), {
        "view": {"group": "mode", "id": "details", "initial": False, "label": "Details"},
        "collapseDefault": True,
        "modeSlide": "details",
        "fx": "slideDetails",
    }, _fill(z=3), [
        _text("BACK TO " + active, "tiny", "text", _box(MX, HEADER_H + 16, 280, 44), "Back label", counter, bind="BackBtn"),
        _text("SELECTED WEAPON", "tiny", "textMute", _box(MX, HEADER_H + 80, 380, 24), "Sel kicker", counter),
        _text((sel or {}).get("name") or "—", "h2", "gold", _box(MX, HEADER_H + 110, 380, 48), "Weapon name", counter, bind="WeaponName"),
        _node("stack", "Stat rows", {"orient": "V"}, _box(MX, HEADER_H + 170, 340, 220), stat_rows, counter),
        _text(desc, "small", "textDim",
              _box(MX, HEADER_H + 400, 340, desc_h), "Desc body", counter, wrap=True, wrapWidth=308, bind="DescBody"),
        _text((sel or {}).get("name") or "", "display", "textMute", _box(MX + 420, HEADER_H + 80, 520, 48), "Ghost name", counter, opacity=0.12, justify="Center"),
        _rect("panelDeep", 520, 160, _box(MX + 420, HEADER_H + 130, 520, 160), "Showcase bg", counter, opacity=0.95),
        _text("AVAILABLE SKINS", "tiny", "textMute", _box(MX + 420, HEADER_H + 304, 400, 20), "Skins heading", counter),
        _node("stack", "Skins row", {"orient": "H"}, _box(MX + 420, HEADER_H + 326, 800, 64), skin_kids, counter),
        _text(power_heading, "tiny", "gold", _box(MX + 420, HEADER_H + 404, 400, 24), "Power heading", counter),
        _node("stack", "Power slots", {"orient": "H"}, _box(MX + 420, HEADER_H + 428, 520, 140), power_kids, counter),
        _text("UPGRADES", "tiny", "gold", _box(STAGE_W - MX - 440, HEADER_H + 80, 400, 24), "Upgrades heading", counter),
        # Preview paints button.props.text — overlay+child text reads as UNDEFINED.
        _node("button", "Primary action", {
            "variant": "loud", "text": action_label,
            "state": "selected" if owned else "normal", "asButton": True,
        }, _box(STAGE_W - MX - 440, HEADER_H + 700, 420, 56), None, counter, bind="ActionBtn"),
    ], counter)

    return _node("canvas", "Root", {}, _fill(), [
        _rect("bg", STAGE_W, STAGE_H, _fill(), "Backdrop", counter),
        listing,
        details,
        header,
    ], counter)


def _demo_skins(color: str) -> list[dict[str, Any]]:
    return [
        {"id": "default", "name": "Default", "color": color or "#9ca3af"},
        {"id": "midnight", "name": "Midnight", "color": "#6366f1"},
        {"id": "ember", "name": "Ember", "color": "#ef4444"},
        {"id": "glacier", "name": "Glacier", "color": "#38bdf8"},
    ]


def _build_picker_root(state: dict[str, Any]) -> dict[str, Any]:
    counter = [0]
    meta = state.setdefault("meta", {})
    mode = meta.get("armoryPicker") or "skins"
    if mode != "powers":
        mode = "skins"
    meta["armoryPicker"] = mode
    weapons = [w for w in (state.get("weapons") or []) if isinstance(w, dict)]
    sel = next((w for w in weapons if w.get("id") == meta.get("armorySelected")), None) or (weapons[0] if weapons else {})
    name = str(sel.get("name") or "Weapon")
    color = str(sel.get("color") or "#9ca3af")
    skins = sel.get("skins") if isinstance(sel.get("skins"), list) and len(sel.get("skins") or []) >= 4 else _demo_skins(color)
    powers = [
        p for p in (state.get("wizardry") or [])
        if isinstance(p, dict) and p.get("buyable") is not False and p.get("kind") in ("element_infusion", "charged")
    ][:8]

    def option_row(title: str, sub: str, accent: str, bind: str, top_pad: int) -> dict[str, Any]:
        return _node("overlay", "Option · " + title, {
            "asButton": True, "variant": "row", "collapseDefault": True,
        }, _sl(v="Top", pad=[0, top_pad, 0, 0]), [
            _rect("row", 684, 88, _sl(), "Row bg", counter, opacity=0.9),
            _rect(accent, 4, 88, _sl(h="Left"), "Row accent", counter),
            _text(title, "body", "text", _sl(h="Left", v="Top", pad=[24, 18, 0, 0]), "Row title", counter),
            _text(sub, "tiny", "textDim", _sl(h="Left", v="Top", pad=[24, 48, 0, 0]), "Row sub", counter),
            _text("Select", "small", "gold", _sl(h="Right", v="Center", pad=[0, 0, 24, 0]), "Row value", counter),
        ], counter, bind=bind)

    def list_layer(list_mode: str, label: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
        kids = rows or [_text("Nothing available yet", "small", "textMute", _sl(v="Top"), "Empty list", counter)]
        layer = _node("stack", label + " list", {"orient": "V"}, _sl(v="Top", pad=[0, 16, 0, 0]), kids, counter)
        layer["props"]["view"] = {"group": "picker", "id": list_mode, "initial": mode == list_mode, "label": label}
        layer["props"]["collapseDefault"] = True
        return layer

    skin_rows = [
        option_row(str(sk.get("name") or sk.get("id") or "Skin"), "Cosmetic · equip anytime", str(sk.get("color") or "stroke"), "Option_%d" % i, 0 if i == 0 else 12)
        for i, sk in enumerate(skins[:4])
    ]
    power_rows = [
        option_row(str(p.get("name") or p.get("id")), str(p.get("element") or p.get("kind") or "") + " · hub equip", str(p.get("color") or "accentAlt"), "Option_%d" % i, 0 if i == 0 else 12)
        for i, p in enumerate(powers)
    ]
    close_btn = _node("overlay", "Close", {
        "asButton": True, "variant": "quiet", "collapseDefault": True,
    }, _sl(h="Right", v="Top"), [
        _rect("stroke", 48, 48, _sl(), "Close border", counter),
        _rect("panelDeep", 44, 44, _sl(h="Center", v="Center"), "Close fill", counter, opacity=0.95),
        _text("✕", "h3", "text", _sl(h="Center", v="Center"), "Close X", counter, justify="Center"),
    ], counter, bind="CloseBtn")
    title = _text("CHOOSE POWER" if mode == "powers" else "CHOOSE SKIN", "h2", "text", _sl(h="Left", v="Top"), "Picker title", counter, bind="PickerTitle")
    header = _node("overlay", "Picker header", {}, _sl(v="Top", pad=[0, 0, 0, 8]), [title, close_btn], counter)
    sub = _text(name + " · tap a row to equip · ✕ closes", "small", "textDim", _sl(v="Top", pad=[0, 0, 0, 12]), "Picker sub", counter, bind="PickerSub")
    tabs = _node("stack", "Tab strip", {"orient": "H"}, _sl(v="Top", pad=[0, 0, 0, 18]), [
        _node("overlay", "Tab · SKINS", {"asButton": True, "variant": "quiet", "state": "selected" if mode == "skins" else "normal"}, _sl(h="Left", v="Fill"), [
            _rect("panelAlt" if mode == "skins" else "panelDeep", 342, 56, _sl(), "Tab bg", counter),
            _rect("gold", 342, 4, _sl(v="Bottom"), "Tab underline", counter, opacity=1 if mode == "skins" else 0),
            _text("SKINS", "small", "text" if mode == "skins" else "textMute", _sl(h="Center", v="Center"), "Tab label", counter),
        ], counter, bind="PickerTabSkins"),
        _node("overlay", "Tab · POWERS", {"asButton": True, "variant": "quiet", "state": "selected" if mode == "powers" else "normal"}, _sl(h="Left", v="Fill"), [
            _rect("panelAlt" if mode == "powers" else "panelDeep", 342, 56, _sl(), "Tab bg", counter),
            _rect("gold", 342, 4, _sl(v="Bottom"), "Tab underline", counter, opacity=1 if mode == "powers" else 0),
            _text("POWERS", "small", "text" if mode == "powers" else "textMute", _sl(h="Center", v="Center"), "Tab label", counter),
        ], counter, bind="PickerTabPowers"),
    ], counter)
    content = _node("stack", "Picker content", {"orient": "V"}, _sl(), [
        header, sub, tabs,
        list_layer("skins", "Skins", skin_rows),
        list_layer("powers", "Powers", power_rows),
        _text("[A] Select   [B] / ✕ Close", "tiny", "textMute", _sl(v="Bottom", pad=[0, 20, 0, 0]), "Picker hints", counter),
    ], counter)
    panel = _node("overlay", "Picker panel", {}, _box((STAGE_W - 780) // 2, (STAGE_H - 720) // 2, 780, 720), [
        _rect("gold", 780, 720, _sl(), "Panel border", counter),
        _rect("panel", 772, 712, _sl(pad=[4, 4, 4, 4]), "Panel fill", counter, opacity=0.97),
        _node("stack", "Panel pad", {"orient": "V"}, _sl(pad=[48, 48, 48, 48]), [content], counter),
    ], counter)
    return _node("canvas", "Root", {}, _fill(), [
        _rect("scrim", STAGE_W, STAGE_H, _fill(), "Scrim", counter, opacity=0.78),
        panel,
    ], counter)


def sync_armory_picker_ui(state: dict[str, Any]) -> bool:
    if not isinstance(state, dict):
        return False
    screens = state.setdefault("uiScreens", [])
    if not isinstance(screens, list):
        return False
    root = _build_picker_root(state)
    notes = (
        "Armory picker popup — Skin_/PowerSlot_ open this canvas. "
        "Toggle SKINS ↔ POWERS (picker view group). CloseBtn ✕ dismisses back to Armory details."
    )
    screen = next((s for s in screens if isinstance(s, dict) and s.get("id") == PICKER_SCREEN_ID), None)
    if not screen:
        screens.append({
            "id": PICKER_SCREEN_ID,
            "name": "Armory Picker",
            "stage": "popup",
            "category": "popup",
            "status": "design",
            "notes": notes,
            "verse": {
                "folder": "GameDevices/Gameplay/Screens/Popup",
                "file": "armory_picker_canvas.verse",
                "klass": "armory_picker_canvas",
            },
            "root": root,
        })
    else:
        screen["root"] = root
        screen["name"] = "Armory Picker"
        screen["notes"] = notes
        if screen.get("status") == "built":
            screen["status"] = "design"
    meta = state.setdefault("meta", {})
    views = meta.setdefault("uiViews", {})
    if views.get("picker") is None:
        views["picker"] = meta.get("armoryPicker") or "skins"
    return True


def sync_armory_ui(state: dict[str, Any]) -> bool:
    """Rebuild scr_shop_weapons from weapons + scrolls. Returns True if state mutated."""
    if not isinstance(state, dict):
        return False
    screens = state.setdefault("uiScreens", [])
    if not isinstance(screens, list):
        return False
    for w in state.get("weapons") or []:
        if not isinstance(w, dict):
            continue
        skins = w.get("skins")
        if not isinstance(skins, list) or len(skins) < 4:
            w["skins"] = _demo_skins(str(w.get("color") or "#9ca3af"))
        slots = w.get("powerSlots")
        if not isinstance(slots, list) or len(slots) < 2:
            if w.get("slotPolicy") == "locked_power" and isinstance(slots, list) and slots:
                open2 = {"id": "slot_element", "index": 2, "kind": "open", "accepts": ["element_infusion", "charged"], "rerollPolicy": "hub", "equippedPowerId": None, "label": "Element Infusion"}
                w["powerSlots"] = [slots[0], open2]
            else:
                w["powerSlots"] = [
                    {"id": "slot_element", "index": 1, "kind": "open", "accepts": ["element_infusion", "charged"], "rerollPolicy": "hub", "equippedPowerId": None, "label": "Element Infusion"},
                    {"id": "slot_charged", "index": 2, "kind": "open", "accepts": ["charged", "element_infusion"], "rerollPolicy": "hub", "equippedPowerId": None, "label": "Charged Scroll"},
                ]
    root = _build_root(state)
    notes = (
        "React ShopUI 1:1 — Weapons + buyable Wizardry (SCROLLS). "
        "Details: 4 skins + 2 power sockets (no orange detail). "
        "Skin_/PowerSlot_ open scr_armory_picker (CloseBtn ✕)."
    )
    screen = next((s for s in screens if isinstance(s, dict) and s.get("id") == ARMORY_SCREEN_ID), None)
    if not screen:
        screens.append({
            "id": ARMORY_SCREEN_ID,
            "name": "Armory",
            "stage": "hub",
            "category": "shop",
            "status": "design",
            "notes": notes,
            "verse": {
                "folder": "GameDevices/Gameplay/Screens/Shop",
                "file": "shop_weapons_canvas.verse",
                "klass": "shop_weapons_canvas",
            },
            "root": root,
        })
    else:
        screen["root"] = root
        screen["name"] = "Armory"
        screen["notes"] = notes
        if screen.get("status") == "built":
            screen["status"] = "design"
    sync_armory_picker_ui(state)
    meta = state.setdefault("meta", {})
    views = meta.setdefault("uiViews", {})
    if views.get("mode") is None:
        views["mode"] = "listing"
    views["category"] = meta.get("armoryCategory") or "PISTOLS"
    views["page"] = str(meta.get("armoryPage") or 0)
    return True
