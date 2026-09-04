"""Sync scr_skill_tree (+ level-up copy) from progression.tree.

Keeps the UI Screens catalogue aligned when MCP mutates skill nodes.
The panel JS does the same rebuild for live edits.
"""

from __future__ import annotations

import copy
from typing import Any


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
    props = {"text": text, "size": size, "color": color, "opacity": 1, "justify": extra.get("justify", "Left"),
             "shadow": False, "shadowColor": "#000000", "shadowOpacity": 0.6,
             "wrap": bool(extra.get("wrap")), "wrapWidth": extra.get("wrapWidth", 0)}
    return _node("text", name, props, slot, None, counter, bind=extra.get("bind"))


def _rect(color: str, w: int, h: int, slot: dict, name: str, counter: list[int], opacity: float = 1.0) -> dict:
    return _node("rect", name, {"color": color, "opacity": opacity, "w": w, "h": h}, slot, None, counter)


def sync_skill_tree_ui(state: dict[str, Any]) -> bool:
    """Rebuild scr_skill_tree from progression. Returns True if state mutated."""
    if not isinstance(state, dict):
        return False
    prog = state.get("progression") or {}
    tree = prog.get("tree") or {}
    nodes = list(tree.get("nodes") or [])
    meta = state.setdefault("meta", {})
    ranks = meta.get("progSimRanks") or {}
    sel_id = meta.get("progSelectedNode")
    sel = next((n for n in nodes if n.get("id") == sel_id), None) or (nodes[0] if nodes else None)
    if sel:
        meta["progSelectedNode"] = sel.get("id")

    # available sim points
    sim_lv = int(meta.get("progSimLevel") or 1)
    table = prog.get("levelTable") or []
    earned = 0
    for row in table:
        if int(row.get("level") or 0) <= sim_lv:
            earned += int(row.get("points") or 0)
    spent = 0
    by = {n.get("id"): n for n in nodes}
    for nid, r in ranks.items():
        n = by.get(nid)
        if not n:
            continue
        spent += max(0, int(r or 0)) * max(1, int(n.get("cost") or 1))
    avail = max(0, earned - spent)

    counter = [0]
    MX, MY = 120, 72
    PANEL_W, PANEL_H, PAD = 1180, 620, 24
    NODE_W, NODE_H, FACE = 88, 100, 64
    tw = max(1, float(tree.get("width") or 900))
    th = max(1, float(tree.get("height") or 520))
    inner_w = PANEL_W - PAD * 2
    inner_h = PANEL_H - PAD * 2
    scale = min(inner_w / tw, inner_h / th)
    ox = (inner_w - tw * scale) / 2
    oy = (inner_h - th * scale) / 2

    canvas_kids: list[dict] = []
    # edges
    for n in nodes:
        for rid in n.get("requires") or []:
            a = by.get(rid)
            if not a:
                continue
            x1 = ox + float(a.get("x") or 0) * scale + NODE_W / 2
            y1 = oy + float(a.get("y") or 0) * scale + FACE / 2
            x2 = ox + float(n.get("x") or 0) * scale + NODE_W / 2
            y2 = oy + float(n.get("y") or 0) * scale + FACE / 2
            unlocked = int(ranks.get(rid) or 0) >= 1
            color = "accentAlt" if unlocked else "stroke"
            op = 0.85 if unlocked else 0.45
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            hx, hw = min(x1, x2), max(2.0, abs(x2 - x1))
            vy, vh = min(y1, y2), max(2.0, abs(y2 - y1))
            canvas_kids.append(_rect(color, int(hw), 2, _slot(aMin=[0,0], aMax=[0,0], off=[int(hx), int(my-1), int(hw), 2]), "Edge H", counter, opacity=op))
            canvas_kids.append(_rect(color, 2, int(vh), _slot(aMin=[0,0], aMax=[0,0], off=[int(mx-1), int(vy), 2, int(vh)]), "Edge V", counter, opacity=op))

    for n in nodes:
        x = ox + float(n.get("x") or 0) * scale
        y = oy + float(n.get("y") or 0) * scale
        color = n.get("color") or "#a855f7"
        selected = bool(sel and sel.get("id") == n.get("id"))
        accent = "gold" if selected else color
        rank = int(ranks.get(n.get("id")) or 0)
        max_r = max(1, int(n.get("maxRank") or 1))
        face_x = int((NODE_W - FACE - 4) / 2)
        face = _node("overlay", "Node face wrap", {}, _slot(aMin=[0,0], aMax=[0,0], off=[face_x, 0, FACE+4, FACE+4]), [
            _rect(accent, FACE+4, FACE+4, _slot(h="Fill", v="Fill"), "Node ring", counter),
            _rect("panelDeep", FACE, FACE, _slot(h="Center", v="Center", pad=[2,2,2,2]), "Node face", counter, opacity=0.95),
            _rect(color, 8, 8, _slot(h="Center", v="Center"), "Node gem", counter),
            _text("%d/%d" % (rank, max_r), "tiny", "gold" if selected else "text", _slot(h="Center", v="Bottom", pad=[0,0,0,6]), "Node rank", counter, justify="Center"),
        ], counter)
        label = _text(n.get("name") or n.get("id") or "?", "tiny", "gold" if selected else "text",
                      _slot(aMin=[0,0], aMax=[0,0], off=[0, FACE+8, NODE_W, 28]), "Node name", counter, justify="Center", wrap=True, wrapWidth=NODE_W)
        canvas_kids.append(_node("overlay", "Node · %s" % (n.get("id") or n.get("name")), {},
                                 _slot(aMin=[0,0], aMax=[0,0], off=[int(x), int(y), NODE_W, NODE_H]), [face, label], counter))

    if not canvas_kids:
        canvas_kids.append(_text("Add skill nodes in the Progression tab", "small", "textMute",
                                 _slot(h="Center", v="Center"), "Tree empty", counter, justify="Center"))

    tree_canvas = _node("overlay", "Tree canvas", {}, _slot(h="Fill", v="Fill", pad=[PAD, PAD, PAD, PAD]), canvas_kids, counter)
    tree_panel = _node("overlay", "Tree panel", {}, _slot(aMin=[0,0], aMax=[0,0], off=[MX, 240, PANEL_W, PANEL_H]), [
        _rect("stroke", PANEL_W, PANEL_H, _slot(h="Fill", v="Fill"), "Panel border", counter),
        _rect("panel", PANEL_W-4, PANEL_H-4, _slot(h="Fill", v="Fill", pad=[2,2,2,2]), "Panel fill", counter, opacity=0.96),
        tree_canvas,
    ], counter)

    req_names = []
    if sel:
        for rid in sel.get("requires") or []:
            t = by.get(rid)
            req_names.append((t or {}).get("name") or rid)
    rank = int(ranks.get(sel.get("id"), 0)) if sel else 0
    max_r = max(1, int(sel.get("maxRank") or 1)) if sel else 1
    cost = max(1, int(sel.get("cost") or 1)) if sel else 1
    body = ("Rank %d / %d — %s" % (rank, max_r, sel.get("effect") or sel.get("desc") or "No effect summary.")) if sel else "Select a node in Progression to preview its card."
    accent = (sel.get("color") if sel else None) or "accentAlt"
    card_w, card_h = 440, 620
    card = _node("overlay", "Card · %s" % ((sel or {}).get("name") or "Empty"), {},
                 _slot(aMin=[1,0], aMax=[1,0], off=[-MX, 240, card_w, card_h], align=[1,0]), [
        _rect(accent, card_w, card_h, _slot(h="Fill", v="Fill"), "Card border", counter),
        _rect("panel", card_w-4, card_h-4, _slot(h="Fill", v="Fill", pad=[2,2,2,2]), "Card fill", counter, opacity=0.97),
        _rect(accent, card_w-4, 6, _slot(h="Fill", v="Top", pad=[2,2,2,0]), "Card rarity bar", counter),
        _node("stack", "Card body", {"orient": "V"}, _slot(h="Fill", v="Fill", pad=[28,22,28,22]), [
            _rect("panelDeep", card_w-56, 140, _slot(h="Fill", v="Top", pad=[0,0,0,18]), "Art plate", counter),
            _text("SELECTED NODE", "tiny", accent if isinstance(accent, str) and not str(accent).startswith("#") else "accentAlt",
                  _slot(h="Left", v="Top", pad=[0,0,0,6]), "Kicker", counter),
            _text((sel or {}).get("name") or "No node selected", "h3", "text", _slot(h="Left", v="Top", pad=[0,0,0,10]), "Card title", counter),
            _text(body, "small", "textDim", _slot(h="Left", v="Top"), "Card body", counter, wrap=True, wrapWidth=card_w-56),
            _node("overlay", "Card footer", {}, _slot(h="Fill", v="Bottom", pad=[0,16,0,0]), [
                _text("Cost: %d point%s" % (cost, "" if cost == 1 else "s"), "body", "gold", _slot(h="Left", v="Center"), "Cost", counter),
                _text(("Requires: " + ", ".join(req_names)) if req_names else "Requires: none", "small", "textMute", _slot(h="Right", v="Center"), "Meta", counter),
            ], counter),
        ], counter),
    ], counter)

    points = _node("overlay", "Points banner", {}, _slot(aMin=[1,0], aMax=[1,0], off=[-MX, MY, 300, 74], align=[1,0]), [
        _rect("panelDeep", 300, 74, _slot(h="Fill", v="Fill"), "Points bg", counter, opacity=0.9),
        _rect("accentAlt", 4, 74, _slot(h="Left", v="Fill"), "Points accent", counter),
        _node("stack", "Points stack", {"orient": "V"}, _slot(h="Left", v="Center", pad=[20,0,0,0]), [
            _text("SKILL POINTS", "tiny", "accentAlt", _slot(h="Left", v="Top", pad=[0,0,0,4]), "Points kicker", counter),
            _text("%d unspent" % avail, "h3", "text", _slot(h="Left", v="Top"), "Points value", counter, bind="PointsText"),
        ], counter),
    ], counter)

    header = _node("stack", "Page header", {"orient": "V"}, _slot(aMin=[0,0], aMax=[0,0], off=[MX, MY, 900, 140]), [
        _rect("accentAlt", 64, 4, _slot(h="Left", v="Top", pad=[0,0,0,12]), "Rule", counter),
        _text("Threads of mastery", "h1", "text", _slot(h="Left", v="Top"), "Title", counter),
        _text("Spend skill points. Later nodes stay locked until their prerequisites are filled.", "small", "textDim",
              _slot(h="Left", v="Top", pad=[0,8,0,0]), "Subtitle", counter),
    ], counter)

    footer = _node("stack", "Footer hints", {"orient": "H"},
                   _slot(aMin=[0,1], aMax=[1,1], off=[MX, -(40+(MY-40)), MX, 40]), [
        _text("[Click] Select node", "tiny", "textMute", _slot(h="Left", v="Center"), "Hint", counter),
        _text("[Space] Upgrade", "tiny", "textMute", _slot(h="Left", v="Center", pad=[36,0,0,0]), "Hint", counter),
        _text("[R] Refund", "tiny", "textMute", _slot(h="Left", v="Center", pad=[36,0,0,0]), "Hint", counter),
        _text("[Esc] Back", "tiny", "textMute", _slot(h="Left", v="Center", pad=[36,0,0,0]), "Hint", counter),
    ], counter)

    root = _node("canvas", "Root", {}, _slot(h="Fill", v="Fill"), [
        _rect("bg", 1920, 1080, _slot(aMin=[0,0], aMax=[1,1], off=[0,0,0,0]), "Backdrop", counter),
        header,
        points,
        tree_panel,
        card,
        footer,
    ], counter)

    screens = state.setdefault("uiScreens", [])
    if not isinstance(screens, list):
        screens = []
        state["uiScreens"] = screens
    screen = next((s for s in screens if s.get("id") == "scr_skill_tree"), None)
    if not screen:
        screen = {
            "id": "scr_skill_tree",
            "name": "Skill Tree",
            "stage": "hub",
            "category": "menu",
            "status": "design",
            "notes": "Mirrors the Progression tab tree. Auto-synced from Progression. Use Write to project for in-game Verse.",
            "verse": {"folder": "GameDevices/Gameplay/Screens/Hub", "file": "skill_tree_canvas.verse", "klass": "skill_tree_canvas"},
            "root": root,
        }
        screens.append(screen)
    else:
        screen["root"] = root
        screen["notes"] = "Mirrors the Progression tab tree. Auto-synced from Progression. Use UI Screens → Write to project to update in-game Verse."
        if screen.get("status") == "built":
            screen["status"] = "design"

    # Level-up copy
    lvl_screen = next((s for s in screens if s.get("id") == "scr_levelup"), None)
    if lvl_screen and isinstance(lvl_screen.get("root"), dict):
        pts = int(prog.get("pointsPerLevel") or 1)
        hp_row = next((r for r in (prog.get("scaling") or []) if r.get("statId") == "hp"), None)
        hp_gain = int(round(float((hp_row or {}).get("perLevel") or 10)))
        hp_now = int(round(float((hp_row or {}).get("base") or 100) + float((hp_row or {}).get("perLevel") or 0) * max(0, sim_lv - 1)))

        def walk(node: Any) -> None:
            if not isinstance(node, dict):
                return
            props = node.get("props") or {}
            name = node.get("name")
            if node.get("type") == "text":
                if name == "Modal title":
                    props["text"] = "LEVEL %d" % sim_lv
                if name == "Row title" and "Skill Point" in str(props.get("text") or ""):
                    props["text"] = "+%d Skill Point%s" % (pts, "" if pts == 1 else "s")
                if name == "Row value" and props.get("color") == "accentAlt":
                    props["text"] = "%d total" % avail
                if name == "Row title" and "Max Health" in str(props.get("text") or ""):
                    props["text"] = "+%d Max Health" % hp_gain
                if name == "Row value" and props.get("color") == "hp":
                    props["text"] = str(hp_now)
                node["props"] = props
            for c in node.get("children") or []:
                walk(c)

        walk(lvl_screen["root"])

    return True
