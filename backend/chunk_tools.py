"""MCP tools for chunks, templates, procgen, import, and layout build."""

from __future__ import annotations

import re
import time
from typing import Any, Callable

from .chunks import (
    DEFAULT_CHUNKS,
    content_disk_path,
    derive_footprint,
    normalize_chunk,
    normalize_chunk_asset,
    normalize_template,
    normalize_uefn_content_path,
)
from .procgen import generate_layout


SOCKET_RE = re.compile(
    r"^Socket_([NESW])(\d+)_(Open|Wall|Door|Window|Ledge|Void)$",
    re.IGNORECASE,
)
SLOT_RE = re.compile(r"^Slot_([A-Z])$", re.IGNORECASE)


def register_chunk_tools(
    api: Any,
    *,
    state: Any,
    save: Callable,
    find: Callable,
    listen: Callable,
    listener_online: Callable,
    cell_to_world: Callable,
    safe_label: Callable,
    log: Callable,
    world_step: int = 512,
) -> dict[str, Callable]:
    """Register chunk/procgen tools on api; return name->fn for panel bridge."""

    tools: dict[str, Callable] = {}

    def _chunks() -> list:
        return state.setdefault("chunks", [])

    def _templates() -> list:
        return state.setdefault("genTemplates", [])

    @api.tool(intent=r"list chunks|chunk catalogue")
    def rgd_list_chunks() -> list:
        """List authored chunks (id, name, size, role, socket summary)."""
        out = []
        for c in _chunks():
            socks = c.get("sockets") or {}
            summary = {
                d: "".join((e.get("kind") or "wall")[0].upper() for e in (socks.get(d) or []))
                for d in ("N", "E", "S", "W")
            }
            out.append({
                "id": c.get("id"),
                "name": c.get("name"),
                "cw": c.get("cw"),
                "ch": c.get("ch"),
                "cz": c.get("cz") or 1,
                "role": c.get("role"),
                "space": c.get("space"),
                "roof": c.get("roof"),
                "prefabPath": c.get("prefabPath") or "",
                "tags": c.get("tags") or [],
                "sockets": summary,
            })
        return out

    @api.tool()
    def rgd_get_chunk(chunk_id: str) -> dict:
        """Return one chunk including sockets, grid footprint, and slots."""
        c = find(_chunks(), chunk_id)
        return c or {"error": "chunk not found: " + chunk_id}

    @api.tool()
    def rgd_create_chunk(
        id: str,
        name: str,
        cw: int = 2,
        ch: int = 2,
        cz: int = 1,
        role: str = "room",
        space: str = "inside",
        roof: bool = True,
        tags: list = None,
        sockets: dict = None,
        rotations: list = None,
        weight: float = 1.0,
        prefab_path: str = "",
        slots: list = None,
    ) -> dict:
        """Create a chunk. sockets: {N:[kind,...], E:[...], S:[...], W:[...]}. cz = stories."""
        if find(_chunks(), id):
            return {"error": "chunk exists: " + id}
        sock_kinds = sockets if isinstance(sockets, dict) else {}
        # convert kind lists to entry lists via normalize
        raw = {
            "id": id,
            "name": name,
            "cw": int(cw),
            "ch": int(ch),
            "cz": int(cz) if cz is not None else 1,
            "role": role,
            "space": space,
            "roof": bool(roof),
            "tags": tags or ["ruins"],
            "rotations": rotations if rotations is not None else [0, 90, 180, 270],
            "weight": float(weight),
            "prefabPath": prefab_path or "",
            "slots": slots or [],
            "sockets": {
                d: [{"kind": k} if isinstance(k, str) else k for k in (sock_kinds.get(d) or [])]
                for d in ("N", "E", "S", "W")
            },
            "gridAuto": True,
        }
        rec = normalize_chunk(raw)
        _chunks().append(rec)
        save(state)
        return {"ok": True, "id": id, "chunk": rec}

    @api.tool()
    def rgd_update_chunk(id: str, fields: dict | None = None, extra: dict | None = None, **kwargs) -> dict:
        """Update chunk fields. Pass grid to flip gridAuto false; pass sockets to re-derive if gridAuto."""
        c = find(_chunks(), id)
        if not c:
            return {"error": "chunk not found: " + id}
        # MCP schema may require `extra`; also accept flat kwargs / nested fields.
        patch = dict(fields or {})
        patch.update(extra or {})
        patch.update(kwargs)
        if "prefab_path" in patch and patch["prefab_path"] is not None:
            patch["prefabPath"] = patch.pop("prefab_path")
        for k, v in list(patch.items()):
            if v is None:
                continue
            if k == "grid":
                c["grid"] = v
                c["gridAuto"] = False
            else:
                c[k] = v
        if c.get("gridAuto") and ("sockets" in patch or "cw" in patch or "ch" in patch):
            c["grid"] = derive_footprint(int(c["cw"]), int(c["ch"]), c.get("sockets") or {})
        rec = normalize_chunk(c)
        c.clear()
        c.update(rec)
        save(state)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_delete_chunk(id: str) -> dict:
        """Delete a chunk from the catalogue."""
        before = len(_chunks())
        state["chunks"] = [c for c in _chunks() if c.get("id") != id]
        save(state)
        return {"ok": True, "removed": before - len(_chunks())}

    @api.tool(intent=r"list gen templates|procgen templates")
    def rgd_list_gen_templates() -> list:
        """List procedural generation templates."""
        return [
            {
                "id": t.get("id"),
                "name": t.get("name"),
                "space": t.get("space"),
                "spine": t.get("spine"),
                "openSocketScope": t.get("openSocketScope"),
                "branchBudget": t.get("branchBudget"),
                "tags": t.get("tags"),
            }
            for t in _templates()
        ]

    @api.tool()
    def rgd_get_gen_template(template_id: str) -> dict:
        """Return one generation template."""
        t = find(_templates(), template_id)
        return t or {"error": "template not found: " + template_id}

    @api.tool()
    def rgd_create_gen_template(
        id: str,
        name: str,
        spine: list = None,
        space: str = "inside",
        open_socket_scope: str = "last",
        branch_budget: int = 0,
        branch_depth_max: int = 1,
        tags: list = None,
        seed: int = 0,
        max_attempts: int = 25,
        metrics: dict = None,
    ) -> dict:
        """Create a generation template (defines a 'type' of procedural level)."""
        if find(_templates(), id):
            return {"error": "template exists: " + id}
        rec = normalize_template({
            "id": id,
            "name": name,
            "spine": spine or ["entrance", "room", "exit"],
            "space": space,
            "openSocketScope": open_socket_scope,
            "branchBudget": int(branch_budget),
            "branchDepthMax": int(branch_depth_max),
            "tags": tags or [],
            "seed": int(seed),
            "maxAttempts": int(max_attempts),
            "metrics": metrics or {"mainPathLen": [3, 40]},
        })
        _templates().append(rec)
        save(state)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_update_gen_template(id: str, **fields) -> dict:
        """Update a generation template. Accepts openSocketScope or open_socket_scope."""
        t = find(_templates(), id)
        if not t:
            return {"error": "template not found: " + id}
        if "open_socket_scope" in fields and fields["open_socket_scope"] is not None:
            fields["openSocketScope"] = fields.pop("open_socket_scope")
        if "branch_budget" in fields and fields["branch_budget"] is not None:
            fields["branchBudget"] = fields.pop("branch_budget")
        if "branch_depth_max" in fields and fields["branch_depth_max"] is not None:
            fields["branchDepthMax"] = fields.pop("branch_depth_max")
        if "max_attempts" in fields and fields["max_attempts"] is not None:
            fields["maxAttempts"] = fields.pop("max_attempts")
        for k, v in fields.items():
            if v is not None:
                t[k] = v
        rec = normalize_template(t)
        t.clear()
        t.update(rec)
        save(state)
        return {"ok": True, "id": id}

    @api.tool()
    def rgd_delete_gen_template(id: str) -> dict:
        """Delete a generation template."""
        state["genTemplates"] = [t for t in _templates() if t.get("id") != id]
        save(state)
        return {"ok": True}

    @api.tool()
    def rgd_force_egypt_catalogue() -> dict:
        """Replace catalogue chunk prefabPaths/tags from on-disk DEFAULT_CHUNKS (Egypt).

        Use after a plugin update when the live host still holds stale EP_Chk_* paths.
        Reloads chunks/defaults modules, overwrites known ids, persists store.
        """
        import importlib
        from copy import deepcopy

        from . import chunks as chunks_mod
        from . import defaults as defaults_mod

        importlib.reload(chunks_mod)
        importlib.reload(defaults_mod)
        defaults = {c["id"]: c for c in chunks_mod.DEFAULT_CHUNKS if c.get("id")}
        kept: list[dict] = []
        seen: set[str] = set()
        for raw in list(_chunks()):
            if not isinstance(raw, dict):
                continue
            cid = raw.get("id")
            if not cid or cid in seen:
                continue
            seen.add(str(cid))
            if cid in defaults:
                n = deepcopy(defaults[cid])
                for k in ("weight", "minCount", "maxCount", "mirror"):
                    if raw.get(k) is not None:
                        n[k] = raw[k]
                kept.append(n)
            else:
                kept.append(normalize_chunk(raw))
        for cid, c in defaults.items():
            if cid not in seen:
                kept.append(deepcopy(c))
                seen.add(cid)
        state["chunks"] = kept
        meta = state.setdefault("meta", {})
        if isinstance(meta, dict):
            meta["chunksFootprintAlign"] = 4
        # Ensure Egypt gen templates exist.
        tpls = state.setdefault("genTemplates", [])
        by_id = {t.get("id"): t for t in tpls if isinstance(t, dict)}
        for t in chunks_mod.DEFAULT_GEN_TEMPLATES:
            tid = t.get("id")
            if not tid:
                continue
            if tid not in by_id:
                tpls.append(deepcopy(t))
            elif "egypt" in (t.get("tags") or []):
                by_id[tid]["tags"] = list(t.get("tags") or ["egypt"])
        save(state)
        egypt = sum(1 for c in kept if "/Egypt/" in (c.get("prefabPath") or ""))
        return {
            "ok": True,
            "chunks": len(kept),
            "egyptPaths": egypt,
            "sample": (kept[0].get("prefabPath") if kept else ""),
        }

    @api.tool(intent=r"generate layout|procedural level|procgen")
    def rgd_generate_layout(
        level_id: str = "",
        template_id: str = "gen_crypt",
        seed: int = None,
        create_level: bool = True,
    ) -> dict:
        """Generate a chunk layout from a Level's Journey + gen template.

        When level_id is set, spine mid-roles come from the selected Journey steps
        (auto entrance/exit). Stamp pools: Journey NPCs + items from those NPCs'
        attached drop tables / bonus loot — never level.include checkboxes.
        Writes layout/grid/gen onto the level — not a hand-painted map.
        """
        from .defaults import (
            normalize_level,
            resolve_journey_for_level,
            migrate_journeys_catalogue,
            include_from_journey,
        )

        migrate_journeys_catalogue(state)
        tpl = find(_templates(), template_id)
        if not tpl:
            # fall back to first template or built-in
            tpl = (_templates() or [None])[0]
            if not tpl:
                from .chunks import DEFAULT_GEN_TEMPLATES
                tpl = DEFAULT_GEN_TEMPLATES[0]
        chunks = _chunks() or DEFAULT_CHUNKS

        level = find(state.setdefault("levels", []), level_id) if level_id else None
        journey_steps = None
        include = None
        if level:
            level = normalize_level(level)
            # write normalized fields back
            idx = next((i for i, l in enumerate(state["levels"]) if l.get("id") == level["id"]), None)
            if idx is not None:
                state["levels"][idx] = level
            jrec = resolve_journey_for_level(state, level)
            journey_steps = (jrec or {}).get("steps") or []
            include = include_from_journey(state, jrec)
            # Mirror resolved stamp onto level.include for preview/debug (not authored).
            level["include"] = dict(include)
            # Prefer the level's last gen template when caller passes empty/default.
            if level.get("gen", {}).get("templateId") and template_id in ("", "gen_crypt"):
                tid = level["gen"]["templateId"]
                t2 = find(_templates(), tid)
                if t2:
                    tpl = t2

        result = generate_layout(
            chunks, tpl, seed=seed, journey_steps=journey_steps, include=include
        )
        if not result.get("ok"):
            log(state, "generate_layout", {"template_id": template_id, "seed": seed}, result.get("error"), ok=False)
            save(state)
            return result

        lid = level_id or ("lvl_gen_%s_%s" % (tpl.get("id") or "x", result["seed"]))
        level = find(state.setdefault("levels", []), lid)
        gen_blob = {
            "templateId": tpl.get("id"),
            "seed": result["seed"],
            "stats": result.get("stats"),
            "spineUsed": result.get("spineUsed") or [],
        }
        if not level and create_level:
            level = normalize_level({
                "id": lid,
                "name": "Generated · %s · %s" % (tpl.get("name") or tpl.get("id"), result["seed"]),
                "w": result["w"],
                "h": result["h"],
                "theme": "#8b5cf6",
                "threat": "Medium",
                "grid": result["grid"],
                "layout": result["layout"],
                "overlay": {"file": "", "opacity": 0.55, "enabled": False, "stretch": True},
                "gen": gen_blob,
            })
            state["levels"].append(level)
            state.setdefault("meta", {})["activeLevelId"] = lid
        elif level:
            level = normalize_level(level)
            level["w"] = result["w"]
            level["h"] = result["h"]
            level["grid"] = result["grid"]
            level["layout"] = result["layout"]
            level["gen"] = gen_blob
            idx = next((i for i, l in enumerate(state["levels"]) if l.get("id") == lid), None)
            if idx is not None:
                state["levels"][idx] = level
        else:
            return {**result, "error": "level not found: " + lid, "ok": False}

        result["levelId"] = lid
        log(state, "generate_layout", {"template_id": template_id, "seed": result["seed"]}, result["stats"].get("chunksPlaced"))
        save(state)
        return result

    @api.tool(intent=r"import chunk from selection|import chunk prefab")
    def rgd_import_chunk_from_selection(
        name: str = "",
        role: str = "room",
        space: str = "inside",
        tags: list = None,
        chunk_id: str = "",
        roof: bool = True,
    ) -> dict:
        """Import a chunk from the currently selected UEFN entity/prefab.

        Reads child markers named Socket_<DIR><INDEX>_<KIND> and Slot_<LETTER>.
        Derives cw/ch from bounds at WORLD_STEP=512 and auto-derives the 2D footprint.
        """
        if not listener_online():
            return {"error": "UEFN listener offline"}
        sel = listen("get_selected_entities", {})
        entities = sel.get("entities") or sel.get("result") or sel.get("selected") or []
        if not entities:
            # fall back to actors
            sel_a = listen("get_selected_actors", {})
            entities = sel_a.get("actors") or sel_a.get("result") or []
        if not entities:
            return {"error": "nothing selected — select a chunk prefab/entity in UEFN"}

        root = entities[0] if isinstance(entities[0], dict) else {"path": entities[0], "name": str(entities[0])}
        root_path = root.get("path") or root.get("entity_path") or root.get("actor_path") or ""
        root_name = root.get("name") or root.get("label") or name or "Imported Chunk"
        info = listen("get_entity_info", {"entity_path": root_path}) if root_path else {}
        if info.get("error"):
            info = listen("get_actor_bounds", {"actor_path": root_path}) or {}

        children = info.get("children") or info.get("entities") or []
        # Also list entities with name filter under selection if children empty
        if not children:
            listed = listen("list_entities", {"name_filter": "", "limit": 200})
            children = listed.get("entities") or listed.get("result") or []

        sockets: dict[str, dict[int, str]] = {"N": {}, "E": {}, "S": {}, "W": {}}
        slots = []
        for ch in children:
            if not isinstance(ch, dict):
                continue
            nm = str(ch.get("name") or ch.get("label") or "")
            m = SOCKET_RE.match(nm)
            if m:
                face, idx, kind = m.group(1).upper(), int(m.group(2)), m.group(3).lower()
                sockets[face][idx] = kind
                continue
            sm = SLOT_RE.match(nm)
            if sm:
                # slot local cell from transform if present
                tr = ch.get("transform") or ch.get("local_transform") or {}
                loc = tr.get("translation") or tr.get("location") or {}
                sx = int(round(float(loc.get("x") or 0) / world_step))
                sy = int(round(float(loc.get("y") or 0) / world_step))
                slots.append({"group": sm.group(1).upper(), "x": max(0, sx), "y": max(0, sy)})

        bounds = info.get("bounds") or info.get("aabb") or {}
        size = bounds.get("size") or {}
        if not size and bounds.get("extent"):
            ext = bounds["extent"]
            size = {"x": float(ext.get("x") or 0) * 2, "y": float(ext.get("y") or 0) * 2}
        if not size:
            # derive from max socket index
            cw = max([max(sockets["N"].keys() or [-1]), max(sockets["S"].keys() or [-1])] + [-1]) + 1
            ch = max([max(sockets["E"].keys() or [-1]), max(sockets["W"].keys() or [-1])] + [-1]) + 1
            cw, ch = max(1, cw), max(1, ch)
        else:
            cw = max(1, int(round(float(size.get("x") or world_step) / world_step)))
            ch = max(1, int(round(float(size.get("y") or world_step) / world_step)))

        def edge_list(face: str, length: int) -> list:
            m = sockets.get(face) or {}
            return [m.get(i, "wall") for i in range(length)]

        sock_map = {
            "N": edge_list("N", cw),
            "S": edge_list("S", cw),
            "E": edge_list("E", ch),
            "W": edge_list("W", ch),
        }
        # prefab path guess
        prefab = info.get("prefab_path") or info.get("asset_path") or root.get("prefab_path") or ""
        cid = chunk_id or ("chk_" + re.sub(r"[^a-z0-9_]+", "_", (name or root_name).lower()).strip("_")[:40])
        existing = find(_chunks(), cid)
        preserve_grid = bool(existing and existing.get("gridAuto") is False)
        raw = {
            "id": cid,
            "name": name or root_name,
            "cw": cw,
            "ch": ch,
            "role": role,
            "space": space,
            "roof": bool(roof) if space == "inside" else False,
            "tags": tags or ["ruins"],
            "prefabPath": prefab,
            "slots": slots,
            "sockets": {d: [{"kind": k} for k in kinds] for d, kinds in sock_map.items()},
            "gridAuto": not preserve_grid,
        }
        if preserve_grid:
            raw["grid"] = existing.get("grid")
            raw["gridAuto"] = False
        rec = normalize_chunk(raw)
        if existing:
            existing.clear()
            existing.update(rec)
        else:
            _chunks().append(rec)
        save(state)
        return {
            "ok": True,
            "id": cid,
            "chunk": rec,
            "markers": {
                "sockets": sum(len(v) for v in sockets.values()),
                "slots": len(slots),
            },
            "root": root_path,
        }

    @api.tool(intent=r"build layout in uefn|build chunks in uefn")
    def rgd_build_layout_in_uefn(level_id: str) -> dict:
        """Instantiate each chunk prefab for a generated level.layout in UEFN."""
        level = find(state.setdefault("levels", []), level_id)
        if not level:
            return {"error": "level not found: " + level_id}
        layout = level.get("layout") or []
        if not layout:
            return {"error": "level has no layout — generate first or use rgd_build_level_in_uefn for painted grids"}
        if not listener_online():
            state["scene"]["listener"] = "offline"
            save(state)
            return {"error": "UEFN listener offline"}

        # Clear prior layout: Entity Prefab instances are entities, not actors.
        # delete_actors alone leaves Chunk_* junk in the level.
        prior = [a for a in state["scene"]["actors"] if a.get("levelId") == level_id]
        for a in prior:
            ent = a.get("label") or a.get("entity") or ""
            if ent:
                listen("destroy_entity", {"entity": ent})
            path = a.get("path") or ""
            if path:
                listen("delete_actors", {"actor_paths": [path]})
        # Belt: destroy any leftover Chunk_* under LevelEntity
        try:
            info = listen("get_entity_info", {"entity": "LevelEntity"}) or {}
            for child in list(info.get("children") or []):
                name = str(child)
                if name.startswith("Chunk_") or name.startswith("RGD_EG_"):
                    listen("destroy_entity", {"entity": name})
        except Exception:
            pass
        state["scene"]["actors"] = [a for a in state["scene"]["actors"] if a.get("levelId") != level_id]

        by_id = {c["id"]: c for c in _chunks()}
        assets_by_id = {
            a.get("id"): a
            for a in (state.get("chunkAssets") or [])
            if isinstance(a, dict) and a.get("id")
        }
        placed = 0
        skipped_filler = 0
        props_placed = 0
        warnings = []
        folder_base = safe_label(level.get("name") or level_id) + "/Chunks"
        props_folder = folder_base + "/Props"
        for p in layout:
            ch = by_id.get(p.get("chunkId"))
            role = str((ch or {}).get("role") or p.get("role") or "").lower()
            # Never flood the island with filler cells — catalogue filler is for
            # generator bookkeeping only (ponytail: skip at build, not at gen).
            if role == "filler" or str(p.get("chunkId") or "").endswith("_filler") or "filler" in str(p.get("chunkId") or "").lower():
                skipped_filler += 1
                continue
            prefab = (ch or {}).get("prefabPath") or p.get("prefabPath") or ""
            # Merged room mesh (real floors/walls). Prefer this over EntityPrefab until
            # Verse VNI classes exist for new SM_* (create_prefab_from_entities needs them).
            mesh = (ch or {}).get("meshPath") or p.get("meshPath") or ""
            if not mesh and prefab:
                # /Roguelike/Prefabs/Chunks/Egypt/.../EP_Egypt_X → /Roguelike/Meshes/Chunks/Egypt/SM_Egypt_X
                leaf = str(prefab).rstrip("/").split("/")[-1]
                if leaf.startswith("EP_"):
                    mesh = "/Roguelike/Meshes/Chunks/Egypt/" + leaf.replace("EP_", "SM_", 1)
            if not prefab and not mesh:
                warnings.append("no prefabPath/meshPath for %s" % p.get("chunkId"))
                continue
            world = cell_to_world(level, p.get("cx") or 0, p.get("cy") or 0)
            rot_z = float(p.get("rot") or 0)
            label = "Chunk_%s_%s_%s" % (p.get("cx"), p.get("cy"), p.get("chunkId"))
            path = ""
            ent = ""
            # Prefer StaticMeshActor placement of merged SM (always visual, no digest wait).
            used_mesh = False
            if mesh:
                exists = listen("does_asset_exist", {"asset_path": mesh}) or {}
                if exists.get("exists") or exists.get("ok") or exists is True or exists.get("result") is True:
                    spawn = listen("spawn_actor", {
                        "asset_path": mesh,
                        "location": [
                            float(world.get("x") or 0),
                            float(world.get("y") or 0),
                            float(world.get("z") or 0),
                        ],
                        "rotation": [0.0, 0.0, float(rot_z)],
                    })
                    if not spawn.get("error"):
                        path = spawn.get("actor_path") or spawn.get("path") or ""
                        used_mesh = True
                    else:
                        warnings.append("%s mesh: %s" % (p.get("chunkId"), spawn.get("error")))
            if not used_mesh and prefab:
                # instantiate_prefab wants SpatialMath list [forward, left, up], not {x,y,z}
                res = listen("instantiate_prefab", {
                    "prefab_path": prefab,
                    "translation": [
                        float(world.get("x") or 0),
                        float(world.get("y") or 0),
                        float(world.get("z") or 0),
                    ],
                    "name": label,
                })
                if res.get("error"):
                    warnings.append("%s: %s" % (p.get("chunkId"), res["error"]))
                    continue
                path = res.get("actor_path") or res.get("path") or res.get("entity_path") or ""
                ent = res.get("instance") or res.get("entity") or res.get("name") or ""
                if ent and rot_z:
                    import math
                    half = math.radians(rot_z) * 0.5
                    listen("set_entity_transform", {
                        "entity": ent,
                        "rotation_quat": [0.0, 0.0, math.sin(half), math.cos(half)],
                    })
            if not path and not ent:
                warnings.append("%s: place failed" % p.get("chunkId"))
                continue
            if path:
                listen("set_actor_label", {"actor_path": path, "label": label})
                listen("set_actor_folder", {"actor_path": path, "folder": folder_base})
            elif ent:
                listen("set_actor_folder", {"actor_path": ent, "folder": folder_base})
            state["scene"]["actors"].append({
                "path": path,
                "label": label,
                "folder": folder_base,
                "kind": "chunk_mesh" if used_mesh else "chunk",
                "levelId": level_id,
                "x": p.get("cx"),
                "y": p.get("cy"),
                "cx": p.get("cx"),
                "cy": p.get("cy"),
                "rot": p.get("rot"),
                "chunkId": p.get("chunkId"),
                "world": world,
                "meshPath": mesh if used_mesh else "",
                "present": True,
            })
            placed += 1

            # Props: placement.props are absolute grid cells (rotated). Fallback: local on chunk.
            prop_list = list(p.get("props") or [])
            props_are_local = False
            if not prop_list and ch:
                prop_list = list(ch.get("props") or [])
                props_are_local = True
            for pr in prop_list:
                if not isinstance(pr, dict):
                    continue
                asset_id = str(pr.get("assetId") or "")
                asset_path = str(pr.get("assetPath") or "")
                if not asset_path and asset_id:
                    asset_path = str((assets_by_id.get(asset_id) or {}).get("assetPath") or "")
                if not asset_path:
                    warnings.append("prop missing asset on %s" % p.get("chunkId"))
                    continue
                lx, ly = int(pr.get("x") or 0), int(pr.get("y") or 0)
                if props_are_local:
                    gx = int(p.get("cx") or 0) + lx
                    gy = int(p.get("cy") or 0) + ly
                else:
                    gx, gy = lx, ly
                pw = cell_to_world(level, gx, gy)
                yaw = float(pr.get("yaw") if pr.get("yaw") is not None else rot_z)
                spawn = listen("spawn_actor", {
                    "asset_path": asset_path,
                    "location": [
                        float(pw.get("x") or 0),
                        float(pw.get("y") or 0),
                        float(pw.get("z") or 0),
                    ],
                    "rotation": [0.0, 0.0, yaw],
                })
                if spawn.get("error"):
                    warnings.append("prop %s: %s" % (asset_id or asset_path, spawn["error"]))
                    continue
                ap = spawn.get("actor_path") or spawn.get("path") or ""
                plabel = "Prop_%s_%s_%s" % (p.get("chunkId"), gx, gy)
                if ap:
                    listen("set_actor_label", {"actor_path": ap, "label": plabel})
                    listen("set_actor_folder", {"actor_path": ap, "folder": props_folder})
                state["scene"]["actors"].append({
                    "path": ap,
                    "label": plabel,
                    "folder": props_folder,
                    "kind": "chunk_prop",
                    "levelId": level_id,
                    "chunkId": p.get("chunkId"),
                    "assetId": asset_id,
                    "x": gx,
                    "y": gy,
                    "present": True,
                })
                props_placed += 1

            # Slot_A / Slot_B marker creative props at absolute slot cells (for Journey injection).
            slot_list = list(p.get("slots") or [])
            if not slot_list and ch:
                # local slots → absolute
                for sl in list(ch.get("slots") or []):
                    if not isinstance(sl, dict):
                        continue
                    slot_list.append({
                        "group": sl.get("group") or sl.get("g") or "A",
                        "x": int(p.get("cx") or 0) + int(sl.get("x") or 0),
                        "y": int(p.get("cy") or 0) + int(sl.get("y") or 0),
                    })
            marker_asset = "/Game/Creative/BuildingActors/Props/CP_Prop_Cube_Fragment_A.CP_Prop_Cube_Fragment_A_C"
            slots_folder = folder_base + "/Slots"
            for si, sl in enumerate(slot_list):
                if not isinstance(sl, dict):
                    continue
                group = str(sl.get("group") or sl.get("g") or "A").upper()
                sx = int(sl.get("x") or 0)
                sy = int(sl.get("y") or 0)
                sw = cell_to_world(level, sx, sy)
                spawn = listen("spawn_actor", {
                    "asset_path": marker_asset,
                    "location": [
                        float(sw.get("x") or 0),
                        float(sw.get("y") or 0),
                        float(sw.get("z") or 0) + 64.0,
                    ],
                    "rotation": [0.0, 0.0, float(rot_z)],
                })
                if spawn.get("error"):
                    warnings.append("slot %s: %s" % (group, spawn["error"]))
                    continue
                ap = spawn.get("actor_path") or spawn.get("path") or ""
                slabel = "Slot_%s_%s_%s_%s" % (group, p.get("chunkId"), sx, sy)
                if ap:
                    listen("set_actor_label", {"actor_path": ap, "label": slabel})
                    listen("set_actor_folder", {"actor_path": ap, "folder": slots_folder})
                state["scene"]["actors"].append({
                    "path": ap,
                    "label": slabel,
                    "folder": slots_folder,
                    "kind": "slot_marker",
                    "slotGroup": group,
                    "levelId": level_id,
                    "chunkId": p.get("chunkId"),
                    "x": sx,
                    "y": sy,
                    "present": True,
                })
                props_placed += 1

        state["scene"]["lastSync"] = int(time.time() * 1000)
        state["scene"]["listener"] = "online"
        result = {
            "level": level.get("name"),
            "chunks": placed,
            "props": props_placed,
            "skippedFiller": skipped_filler,
            "warnings": warnings,
        }
        log(state, "build_layout_in_uefn", {"level_id": level_id}, placed)
        save(state)
        return result

    def _assets() -> list:
        return state.setdefault("chunkAssets", [])

    @api.tool(intent=r"list chunk assets|kit assets catalogue")
    def rgd_list_chunk_assets() -> list:
        """List kit/prop assets (floor, wall, roof, arch, column, …) with Content paths."""
        out = []
        for a in _assets():
            if not isinstance(a, dict):
                continue
            na = normalize_chunk_asset(a)
            if na:
                out.append(na)
        return out

    @api.tool()
    def rgd_upsert_chunk_asset(
        id: str,
        name: str = "",
        asset_path: str = "",
        kind: str = "prop",
        preview: str = "",
    ) -> dict:
        """Create or update a catalogue asset. Paths accept Content/… or /Mount/…."""
        aid = str(id or "").strip()
        if not aid:
            return {"error": "id required"}
        path = normalize_uefn_content_path(asset_path)
        rec = normalize_chunk_asset({
            "id": aid,
            "name": name or aid,
            "assetPath": path,
            "kind": kind or "prop",
            "preview": preview or kind or "prop",
            "source": "catalogue",
        })
        if not rec:
            return {"error": "invalid asset"}
        existing = find(_assets(), aid)
        if existing:
            existing.clear()
            existing.update(rec)
        else:
            _assets().append(rec)
        save(state)
        return {"ok": True, "asset": rec}

    @api.tool(intent=r"sync chunk assets from uefn|import meshes from content")
    def rgd_sync_chunk_assets_from_uefn(
        directory: str = "",
        search: str = "SM_",
        limit: int = 80,
    ) -> dict:
        """Scan project Content meshes via UEFN search_assets and merge into catalogue."""
        if not listener_online():
            return {"error": "UEFN listener offline"}
        info = listen("get_project_info", {}) or {}
        mount = str(info.get("content_root") or info.get("project_content_root") or "/Roguelike").rstrip("/")
        if not mount.startswith("/"):
            mount = "/" + mount
        # content_root is often /Roguelike — search under Meshes + Prefabs + Stylized packs
        dirs = [directory] if directory else [
            f"{mount}/Meshes",
            f"{mount}/Prefabs",
            f"{mount}/Stylized_Egypt",
            f"{mount}/MagicianLabatory",
        ]
        added, updated, seen = 0, 0, set()
        warnings: list[str] = []
        by_path = {
            str(a.get("assetPath") or ""): a
            for a in _assets()
            if isinstance(a, dict) and a.get("assetPath")
        }
        by_id = {
            str(a.get("id") or ""): a
            for a in _assets()
            if isinstance(a, dict) and a.get("id")
        }
        lim = max(1, min(int(limit or 80), 200))
        for d in dirs:
            if not d:
                continue
            res = listen("search_assets", {
                "search": search or "SM_",
                "directory": d,
                "limit": lim,
                "fields": ["path", "name", "class"],
            }) or {}
            items = res.get("assets") or res.get("results") or res.get("items") or []
            if isinstance(res, list):
                items = res
            if res.get("error"):
                warnings.append("%s: %s" % (d, res["error"]))
                continue
            for it in items:
                if not isinstance(it, dict):
                    continue
                path = normalize_uefn_content_path(
                    str(it.get("path") or it.get("asset_path") or it.get("object_path") or ""),
                    mount=mount.strip("/"),
                )
                if not path or path in seen:
                    continue
                name = str(it.get("name") or path.rsplit("/", 1)[-1])
                cls = str(it.get("class") or it.get("asset_class") or "").lower()
                if "staticmesh" not in cls and "mesh" not in cls and not name.startswith("SM_"):
                    # still allow Prefab EP_ as prop shells
                    if not name.startswith("EP_"):
                        continue
                seen.add(path)
                low = (name + " " + path).lower()
                if "column" in low or "pillar" in low:
                    kind, preview = "column", "column"
                elif "wall" in low:
                    kind, preview = "wall", "wall"
                elif "floor" in low or "tile" in low:
                    kind, preview = "floor", "floor"
                elif "roof" in low or "ceiling" in low:
                    kind, preview = "roof", "roof"
                elif "arch" in low:
                    kind, preview = "arch", "arch"
                elif "door" in low:
                    kind, preview = "door", "door"
                else:
                    kind, preview = "prop", "cube"
                aid = "uefn_" + re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_").lower()[:48]
                if not aid or aid == "uefn_":
                    aid = "uefn_" + str(abs(hash(path)) % 10_000_000)
                rec = normalize_chunk_asset({
                    "id": aid,
                    "name": name,
                    "assetPath": path,
                    "kind": kind,
                    "preview": preview,
                    "source": "uefn",
                })
                if not rec:
                    continue
                if path in by_path:
                    cur = by_path[path]
                    cur.update({
                        "assetPath": path,
                        "contentPath": content_disk_path(path),
                        "kind": cur.get("kind") or kind,
                        "preview": cur.get("preview") or preview,
                        "source": "uefn",
                    })
                    updated += 1
                elif aid in by_id:
                    cur = by_id[aid]
                    cur.update(rec)
                    by_path[path] = cur
                    updated += 1
                else:
                    _assets().append(rec)
                    by_path[path] = rec
                    by_id[aid] = rec
                    added += 1
        save(state)
        return {
            "ok": True,
            "added": added,
            "updated": updated,
            "scanned": len(seen),
            "total": len(_assets()),
            "mount": mount,
            "warnings": warnings,
        }

    _ROLE_VERSE = {
        "entrance": "Entrance",
        "exit": "Exit",
        "room": "Room",
        "connector": "Connector",
        "objective": "Objective",
        "boss": "Boss",
        "deadend": "Deadend",
        "cap": "Cap",
        "filler": "Filler",
    }
    _SPACE_VERSE = {"inside": "Inside", "outside": "Outside"}

    @api.tool(intent=r"sync generation device chunks|populate verse chunk catalogue")
    def rgd_sync_generation_device(device_path: str = "", theme_tag: str = "egypt") -> dict:
        """Fill a placed roguelike_generation_device.Chunks[] from the RGD catalogue.

        Writes ChunkId / DisplayName / Role / Space / Cw / Ch / Cz / Weight /
        PrefabPath for every catalogue entry so Details Chunks[] matches the
        catalogue. MarkerProp stays a manual Outliner prop dropdown. Also sets ThemeTag.
        """
        if not listener_online():
            return {"error": "UEFN listener offline"}
        path = str(device_path or "").strip()
        if not path:
            # Auto-find first generation device in level
            found = listen("find_devices", {"label_filter": "generation", "limit": 20}) or {}
            items = found.get("devices") or found.get("actors") or found.get("results") or []
            if isinstance(found, list):
                items = found
            for it in items if isinstance(items, list) else []:
                if not isinstance(it, dict):
                    continue
                cls = str(it.get("class") or it.get("verse_class") or it.get("type") or "").lower()
                label = str(it.get("label") or it.get("name") or "")
                ap = str(it.get("actor_path") or it.get("path") or "")
                if "generation" in cls or "generation" in label.lower() or "roguelike_generation" in cls:
                    path = ap or label
                    break
            if not path:
                return {"error": "no generation device found — pass device_path"}
        chunks = [c for c in _chunks() if isinstance(c, dict)]
        n = len(chunks)
        if n <= 0:
            return {"error": "catalogue empty"}
        # ThemeTag / WorldStep — listener uses field= not property=
        listen("set_verse_editable", {
            "actor_path": path,
            "field": "ThemeTag",
            "value": str(theme_tag or ""),
        })
        listen("set_verse_editable", {
            "actor_path": path,
            "field": "WorldStep",
            "value": float(world_step),
        })
        # Listener command name is resize_verse_array_field (not resize_verse_array).
        rz = listen("resize_verse_array_field", {
            "actor_path": path,
            "array_field": "Chunks",
            "count": n,
        }) or {}
        patched = 0
        warnings = []
        if rz.get("error"):
            warnings.append("resize: %s" % rz["error"])
        for i, c in enumerate(chunks):
            role = _ROLE_VERSE.get(str(c.get("role") or "room").lower(), "Room")
            space = _SPACE_VERSE.get(str(c.get("space") or "inside").lower(), "Inside")
            entry = {
                "ChunkId": str(c.get("id") or ""),
                "DisplayName": str(c.get("name") or c.get("id") or ""),
                "Role": role,
                "Space": space,
                "Cw": int(c.get("cw") or 2),
                "Ch": int(c.get("ch") or 2),
                "Cz": int(c.get("cz") or 1),
                "Weight": float(c.get("weight") or 1.0),
                "PrefabPath": str(c.get("prefabPath") or ""),
            }
            res = listen("patch_verse_array_entry", {
                "actor_path": path,
                "array_field": "Chunks",
                "index": i,
                "properties": entry,
            }) or {}
            if res.get("error"):
                warnings.append("Chunks[%s]: %s" % (i, res["error"]))
            else:
                patched += 1
        return {
            "ok": True,
            "device": path,
            "themeTag": theme_tag,
            "catalogue": n,
            "patched": patched,
            "warnings": warnings,
        }

    @api.tool(intent=r"verify layout parity|diff layout vs uefn")
    def rgd_verify_layout_parity(level_id: str) -> dict:
        """Diff level.layout placements against scene actors recorded for this level."""
        level = find(state.setdefault("levels", []), level_id)
        if not level:
            return {"error": "level not found: " + level_id}
        layout = list(level.get("layout") or [])
        actors = [
            a for a in (state.get("scene") or {}).get("actors") or []
            if isinstance(a, dict) and a.get("levelId") == level_id and a.get("kind") == "chunk"
        ]
        by_key = {}
        for a in actors:
            key = "%s:%s:%s" % (a.get("chunkId"), a.get("cx"), a.get("cy"))
            by_key[key] = a
        missing = []
        mismatched = []
        matched = 0
        for p in layout:
            ch_meta = find(_chunks(), str(p.get("chunkId") or "")) or {}
            if not (p.get("prefabPath") or ch_meta.get("prefabPath")):
                # skipped empties don't count
                continue
            key = "%s:%s:%s" % (p.get("chunkId"), p.get("cx"), p.get("cy"))
            a = by_key.get(key)
            if not a:
                missing.append(key)
                continue
            world = cell_to_world(level, p.get("cx") or 0, p.get("cy") or 0)
            aw = a.get("world") or {}
            dx = abs(float(aw.get("x") or 0) - float(world.get("x") or 0))
            dy = abs(float(aw.get("y") or 0) - float(world.get("y") or 0))
            if dx > 1.0 or dy > 1.0 or int(a.get("rot") or 0) != int(p.get("rot") or 0):
                mismatched.append({"key": key, "dx": dx, "dy": dy, "rot_a": a.get("rot"), "rot_p": p.get("rot")})
            else:
                matched += 1
        return {
            "ok": len(missing) == 0 and len(mismatched) == 0,
            "layout": len(layout),
            "actors": len(actors),
            "matched": matched,
            "missing": missing[:40],
            "mismatched": mismatched[:40],
        }

    for name, fn in list(locals().items()):
        if name.startswith("rgd_") and callable(fn):
            tools[name] = fn
    return tools
