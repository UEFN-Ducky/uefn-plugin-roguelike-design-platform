"""Chunk-based procedural level generator (Warframe DFS + Diablo-3 sockets)."""

from __future__ import annotations

import hashlib
import random
from collections import deque
from copy import deepcopy
from typing import Any

from .chunks import (
    DIRS,
    OPP,
    ensure_ports,
    normalize_chunk,
    normalize_template,
    occupied_cells,
    rotate_chunk_dims,
    rotate_grid,
    rotate_ports,
    rotate_sockets,
    socket_is_open,
    sockets_compatible,
)

# Neighbour offset for each face (dx, dy) — grid y grows south/down.
FACE_DELTA = {"N": (0, -1), "E": (1, 0), "S": (0, 1), "W": (-1, 0)}


def _stage_seed(seed: int, stage: str) -> random.Random:
    h = hashlib.sha256(f"{seed}:{stage}".encode("utf-8")).hexdigest()
    return random.Random(int(h[:16], 16))


def _shuffled(seq: list, rng: random.Random) -> list:
    out = list(seq)
    rng.shuffle(out)
    return out


def _ports_world(chunk: dict, ox: int, oy: int, rot: int) -> list[dict]:
    """Rotated ports in world space (open + closed)."""
    cw0, ch0 = int(chunk["cw"]), int(chunk["ch"])
    ports = rotate_ports(ensure_ports(chunk), cw0, ch0, rot)
    out = []
    for i, p in enumerate(ports):
        entry = {
            "kind": p.get("kind") or "wall",
            "size": int(p.get("size") or 1),
            "height_step": int(p.get("height_step") or p.get("z") or 0),
        }
        out.append({
            "face": p["face"],
            "index": i,
            "lx": int(p["x"]),
            "ly": int(p["y"]),
            "x": ox + int(p["x"]),
            "y": oy + int(p["y"]),
            "entry": entry,
            "chunkId": chunk["id"],
        })
    return out


def _chunk_open_sockets(chunk: dict, ox: int, oy: int, rot: int) -> list[dict]:
    """World-space open ports for a placed chunk (polyomino perimeter)."""
    return [s for s in _ports_world(chunk, ox, oy, rot) if socket_is_open(s.get("entry"))]


def _align(chunk: dict, rot: int, src_sock: dict, target: dict) -> tuple[int, int] | None:
    """Compute origin (ox, oy) so src port cell meets target (opposing faces)."""
    face = src_sock["face"]
    if OPP[face] != target["face"]:
        return None
    lx = int(src_sock.get("lx", src_sock.get("index", 0)))
    ly = int(src_sock.get("ly", 0))
    # Legacy bbox sockets only had index along the edge — recover lx/ly.
    if "lx" not in src_sock and "ly" not in src_sock:
        cw, ch = rotate_chunk_dims(int(chunk["cw"]), int(chunk["ch"]), rot)
        i = int(src_sock.get("index") or 0)
        if face == "N":
            lx, ly = i, 0
        elif face == "S":
            lx, ly = i, ch - 1
        elif face == "E":
            lx, ly = cw - 1, i
        else:
            lx, ly = 0, i
    tx, ty = target["x"], target["y"]
    if face == "N":
        return tx - lx, ty + 1 - ly
    if face == "S":
        return tx - lx, ty - 1 - ly
    if face == "E":
        return tx - 1 - lx, ty - ly
    if face == "W":
        return tx + 1 - lx, ty - ly
    return None


def _cells_of(chunk: dict, ox: int, oy: int, rot: int) -> list[tuple[int, int]]:
    """World cells occupied by solid footprint cells (empty = packable notch)."""
    return [(ox + x, oy + y) for x, y in occupied_cells(chunk, rot)]


def _port_at_cell(chunk: dict, rot: int, ox: int, oy: int, wx: int, wy: int, face: str) -> dict | None:
    for p in _ports_world(chunk, ox, oy, rot):
        if p["face"] == face and p["x"] == wx and p["y"] == wy:
            return p.get("entry")
    return {"kind": "wall", "size": 1, "height_step": 0}


def _edge_socket_at(chunk: dict, rot: int, face: str, local_i: int) -> dict | None:
    """Legacy helper — prefer port lookup via _port_at_cell for polyominoes."""
    socks = rotate_sockets(chunk.get("sockets") or {}, rot)
    entries = socks.get(face) or []
    if 0 <= local_i < len(entries):
        return entries[local_i]
    return None


class _Layout:
    def __init__(self) -> None:
        self.placements: list[dict] = []
        self.occupancy: dict[tuple[int, int], dict] = {}  # cell -> placement meta
        self.open_sockets: list[dict] = []
        self.role_counts: dict[str, int] = {}
        self.rollbacks = 0
        self.rejections: dict[str, int] = {}
        self.joins: list[dict] = []
        self.pref_face: str | None = None  # preferred growth face for straightness

    def reject(self, reason: str, chunk_id: str = "") -> None:
        key = reason if not chunk_id else f"{reason}:{chunk_id}"
        self.rejections[key] = self.rejections.get(key, 0) + 1

    def open_sockets_of_last(self) -> list[dict]:
        if not self.placements:
            return []
        last = self.placements[-1]
        cid = last["chunkId"]
        return [s for s in self.open_sockets if s.get("placementId") == last.get("placementId")]

    def snapshot_placements(self) -> list[dict]:
        return deepcopy(self.placements)


def _overlaps(layout: _Layout, cells: list[tuple[int, int]]) -> bool:
    return any(c in layout.occupancy for c in cells)


def _violates_neighbours(chunk: dict, ox: int, oy: int, rot: int, layout: _Layout) -> bool:
    """Diablo-3 three-valued neighbour check on every exposed solid-cell face."""
    our_cells = set(_cells_of(chunk, ox, oy, rot))

    for x, y in our_cells:
        for face, (dx, dy) in FACE_DELTA.items():
            nx, ny = x + dx, y + dy
            if (nx, ny) in our_cells:
                continue
            meta = layout.occupancy.get((nx, ny))
            if meta is None:
                continue  # Free — open ports may stick out
            ours = _port_at_cell(chunk, rot, ox, oy, x, y, face)
            nface = OPP[face]
            nchunk = meta["chunk"]
            nrot = meta["rot"]
            nox, noy = meta["ox"], meta["oy"]
            nentry = _port_at_cell(nchunk, nrot, nox, noy, nx, ny, nface)
            n_open = socket_is_open(nentry)
            o_open = socket_is_open(ours)
            if n_open != o_open:
                return True
            if n_open and o_open and not sockets_compatible(ours, nentry):
                return True
    return False


def _commit(layout: _Layout, chunk: dict, ox: int, oy: int, rot: int, joined_target: dict | None) -> dict:
    pid = f"p{len(layout.placements)}"
    cells = _cells_of(chunk, ox, oy, rot)
    meta = {"chunk": chunk, "ox": ox, "oy": oy, "rot": rot, "placementId": pid}
    for c in cells:
        layout.occupancy[c] = meta
    placement = {
        "placementId": pid,
        "chunkId": chunk["id"],
        "cx": ox,
        "cy": oy,
        "rot": rot,
        "mirror": False,
        "role": chunk.get("role"),
        "cw": rotate_chunk_dims(int(chunk["cw"]), int(chunk["ch"]), rot)[0],
        "ch": rotate_chunk_dims(int(chunk["cw"]), int(chunk["ch"]), rot)[1],
        "roof": bool(chunk.get("roof")),
        "prefabPath": chunk.get("prefabPath") or "",
        "slots": [
            {"group": s.get("group"), "x": ox + int(s.get("x") or 0), "y": oy + int(s.get("y") or 0)}
            for s in (chunk.get("slots") or [])
        ],
        "props": [
            {
                "assetId": pr.get("assetId"),
                "assetPath": pr.get("assetPath"),
                "yaw": float(pr.get("yaw") or 0) + rot,
                "x": ox + int(pr.get("x") or 0),
                "y": oy + int(pr.get("y") or 0),
            }
            for pr in (chunk.get("props") or [])
        ],
    }
    # Rotate slot/prop local coords for 90/180/270 — stored in unrotated chunk space.
    if rot:
        cw0, ch0 = int(chunk["cw"]), int(chunk["ch"])

        def _rot_xy(lx: int, ly: int) -> tuple[int, int]:
            if rot == 90:
                return ch0 - 1 - ly, lx
            if rot == 180:
                return cw0 - 1 - lx, ch0 - 1 - ly
            if rot == 270:
                return ly, cw0 - 1 - lx
            return lx, ly

        rotated_slots = []
        for s in chunk.get("slots") or []:
            lx, ly = _rot_xy(int(s.get("x") or 0), int(s.get("y") or 0))
            rotated_slots.append({"group": s.get("group"), "x": ox + lx, "y": oy + ly})
        placement["slots"] = rotated_slots
        rotated_props = []
        for pr in chunk.get("props") or []:
            lx, ly = _rot_xy(int(pr.get("x") or 0), int(pr.get("y") or 0))
            rotated_props.append({
                "assetId": pr.get("assetId"),
                "assetPath": pr.get("assetPath"),
                "yaw": float(pr.get("yaw") or 0) + rot,
                "x": ox + lx,
                "y": oy + ly,
            })
        placement["props"] = rotated_props

    layout.placements.append(placement)
    layout.role_counts[chunk.get("role") or ""] = layout.role_counts.get(chunk.get("role") or "", 0) + 1

    # Add open sockets; remove target if joined
    if joined_target is not None:
        layout.open_sockets = [
            s for s in layout.open_sockets
            if not (s["x"] == joined_target["x"] and s["y"] == joined_target["y"] and s["face"] == joined_target["face"])
        ]
        layout.joins.append({"a": joined_target, "b": {"chunkId": chunk["id"], "ox": ox, "oy": oy, "rot": rot}})

    for s in _chunk_open_sockets(chunk, ox, oy, rot):
        s["placementId"] = pid
        # Don't re-open the socket we just joined
        if joined_target and OPP[s["face"]] == joined_target["face"]:
            # check if this socket cell is adjacent to target cell
            dx, dy = FACE_DELTA[s["face"]]
            if s["x"] + dx == joined_target["x"] and s["y"] + dy == joined_target["y"]:
                continue
        layout.open_sockets.append(s)
    return placement


def _rollback(layout: _Layout) -> None:
    if not layout.placements:
        return
    last = layout.placements.pop()
    pid = last["placementId"]
    layout.rollbacks += 1
    role = last.get("role") or ""
    if role:
        layout.role_counts[role] = max(0, layout.role_counts.get(role, 1) - 1)
    # Remove occupancy
    layout.occupancy = {k: v for k, v in layout.occupancy.items() if v.get("placementId") != pid}
    # Remove sockets of this placement
    layout.open_sockets = [s for s in layout.open_sockets if s.get("placementId") != pid]
    # Re-open the join socket on the previous chunk if we closed one — rebuild from remaining placements.
    # Simpler: rebuild open sockets from all remaining placements (O(n) but n is tiny).
    layout.open_sockets = []
    layout.joins = layout.joins[:-1] if layout.joins else []
    for p in layout.placements:
        ch = None
        # find chunk dict from occupancy
        for meta in layout.occupancy.values():
            if meta.get("placementId") == p["placementId"]:
                ch = meta["chunk"]
                break
        if not ch:
            continue
        for s in _chunk_open_sockets(ch, p["cx"], p["cy"], p["rot"]):
            s["placementId"] = p["placementId"]
            # skip sockets that sit against another occupied neighbour with matching open
            dx, dy = FACE_DELTA[s["face"]]
            nb = (s["x"] + dx, s["y"] + dy)
            if nb in layout.occupancy:
                continue
            layout.open_sockets.append(s)


def _is_open_sprawl(tpl: dict) -> bool:
    return str(tpl.get("openSocketScope") or "last") == "all" and int(tpl.get("branchBudget") or 0) >= 6


def _chunk_story_span(c: dict) -> int:
    """How many stories this chunk occupies (cz and elevated sockets)."""
    try:
        cz = max(1, int(c.get("cz") if c.get("cz") is not None else c.get("stories") or 1))
    except (TypeError, ValueError):
        cz = 1
    hz = 0
    for edge in (c.get("sockets") or {}).values():
        for e in edge or []:
            if isinstance(e, dict):
                try:
                    hz = max(hz, int(e.get("height_step") or e.get("z") or 0))
                except (TypeError, ValueError):
                    pass
    for p in c.get("ports") or []:
        if isinstance(p, dict):
            try:
                hz = max(hz, int(p.get("height_step") or p.get("z") or 0))
            except (TypeError, ValueError):
                pass
    # ledge/door @ height_step 1 needs a 2-story map to connect
    return max(cz, hz + 1 if hz else cz)


def _tpl_map_height(tpl: dict) -> int:
    """Max stories the layout may use (1 = flat only)."""
    raw = tpl.get("mapHeight")
    if raw is None:
        raw = tpl.get("maxStories")
    try:
        return max(1, min(8, int(raw if raw is not None else 1)))
    except (TypeError, ValueError):
        return 1


def _pool_for(
    role: str,
    chunks: list[dict],
    tpl: dict,
    layout: _Layout,
    *,
    branch: bool = False,
) -> list[dict]:
    tags = set(tpl.get("tags") or [])
    space = tpl.get("space") or "inside"
    straight = _tpl_straightness(tpl)
    max_h = _tpl_map_height(tpl)
    out = []
    for c in chunks:
        if (c.get("role") or "") != role:
            continue
        if role not in ("cap", "filler"):
            if space and c.get("space") and c.get("space") != space:
                continue
            if tags and c.get("tags") and not (tags & set(c.get("tags") or [])):
                continue
        span = _chunk_story_span(c)
        if span > max_h:
            continue
        # Flat maps: no vertical-tagged catalogue pieces
        if max_h <= 1 and "vertical" in (c.get("tags") or []):
            continue
        out.append(c)
    if not out:
        return out
    # Spine: straightness prefers halls. Branches: prefer L/T so they can leave the corridor.
    # mapHeight > 1 boosts stairs/balconies/tall rooms so vertical pieces actually show up.
    def _w(c: dict) -> float:
        w = max(0.01, float(c.get("weight") or 1.0))
        if role == "connector":
            cid = str(c.get("id") or "").upper()
            shape = str(c.get("shape") or "").upper()
            key = cid + "|" + shape
            straight_hit = any(s in key for s in ("STRAIGHT", "TET_I", "|I", "HALL_I"))
            bend_hit = any(s in key for s in ("CONN_L", "CONN_T", "|L", "|J", "|T", "|S", "|Z", "PLUS"))
            if branch:
                if bend_hit:
                    w *= 2.5
                if straight_hit:
                    w *= 0.55
            else:
                if straight_hit:
                    w *= 0.35 + (straight / 100.0) * 2.4
                if bend_hit:
                    w *= 0.15 + ((100 - straight) / 100.0) * 2.0
                    if straight >= 85 and not _is_open_sprawl(tpl):
                        w *= 0.05
        span = _chunk_story_span(c)
        vert = span > 1 or "vertical" in (c.get("tags") or [])
        if max_h >= 2:
            if vert:
                w *= 1.2 + 0.25 * min(4, max_h - 1)
            else:
                w *= 0.88
        return w
    order = list(range(len(out)))
    order.sort(key=lambda i: -_w(out[i]))
    return [out[i] for i in order]


def _tpl_straightness(tpl: dict) -> int:
    try:
        return max(0, min(100, int(tpl.get("straightness") if tpl.get("straightness") is not None else 50)))
    except (TypeError, ValueError):
        return 50


def _infer_pref_face(layout: _Layout) -> str | None:
    """Growth axis from the first chunk's open doors (entrance facing)."""
    if not layout.placements:
        return None
    pid = layout.placements[0].get("placementId")
    faces = [s.get("face") for s in layout.open_sockets if s.get("placementId") == pid and s.get("face")]
    if not faces:
        faces = [s.get("face") for s in layout.open_sockets if s.get("face")]
    if not faces:
        return "E"
    return max(set(faces), key=faces.count)


def _order_targets(targets: list[dict], layout: _Layout, tpl: dict, rng: random.Random) -> list[dict]:
    """Bias spine growth along preferred face. Open sprawl keeps soft bias only."""
    if not targets:
        return targets
    straight = _tpl_straightness(tpl)
    pref = getattr(layout, "pref_face", None)
    if straight < 30 or not pref:
        return _shuffled(targets, rng)
    # Open + many branches: don't hard-lock the spine to one axis
    hard = straight >= 75 and not _is_open_sprawl(tpl)
    ranked: list[tuple[int, dict]] = []
    for t in targets:
        face = t.get("face")
        if face == pref:
            sc = 0
        elif face == OPP.get(pref):
            sc = 3
        else:
            sc = 1
        if hard and straight >= 90 and face != pref:
            continue
        if hard and straight >= 75 and face == OPP.get(pref):
            continue
        ranked.append((sc, t))
    if not ranked:
        ranked = [(0, t) for t in targets]
    ranked = _shuffled(ranked, rng)
    ranked.sort(key=lambda x: x[0])
    return [t for _, t in ranked]


def _queue_role(entry: Any) -> tuple[str, int | None, bool]:
    if isinstance(entry, dict):
        role = str(entry.get("role") or "room")
        oi = entry.get("objectiveIndex")
        try:
            oi_i = int(oi) if oi is not None else None
        except (TypeError, ValueError):
            oi_i = None
        return role, oi_i, bool(entry.get("preferLarge"))
    return str(entry), None, False


def _place_next(
    depth: int,
    queue: list,
    layout: _Layout,
    tpl: dict,
    chunks: list[dict],
    rng: random.Random,
) -> bool:
    if depth >= len(queue):
        return True
    role, obj_idx, prefer_large = _queue_role(queue[depth])
    pool = _pool_for(role, chunks, tpl, layout)
    # Boss role may be missing in catalogue — fall back to large objective.
    if not pool and role == "boss":
        role = "objective"
        prefer_large = True
        pool = _pool_for(role, chunks, tpl, layout)
    if prefer_large and pool:
        pool = sorted(
            pool,
            key=lambda c: -len(occupied_cells(c, 0)),
        )
    candidates = _shuffled(pool, rng)
    if prefer_large and candidates:
        # Keep largest half first so arenas stay wide.
        half = max(1, len(candidates) // 2)
        candidates = candidates[:half] + candidates[half:]
    if not candidates:
        layout.reject("no_candidates", role)
        return False
    for chunk in candidates:
        for rot in _shuffled(list(chunk.get("rotations") or [0]), rng):
            if not layout.placements:
                # First chunk at origin
                if _overlaps(layout, _cells_of(chunk, 0, 0, rot)):
                    continue
                placement = _commit(layout, chunk, 0, 0, rot, None)
                if obj_idx is not None:
                    placement["objectiveIndex"] = obj_idx
                if layout.pref_face is None:
                    layout.pref_face = _infer_pref_face(layout)
                if _place_next(depth + 1, queue, layout, tpl, chunks, rng):
                    return True
                _rollback(layout)
                layout.pref_face = None
                continue
            scope = tpl.get("openSocketScope") or "last"
            targets = layout.open_sockets_of_last() if scope == "last" else list(layout.open_sockets)
            targets = _order_targets(targets, layout, tpl, rng)
            if not targets:
                layout.reject("no_open_sockets", chunk["id"])
                continue
            # Local open ports (polyomino perimeter) in rotated space at origin
            local_open = []
            for s in _ports_world(chunk, 0, 0, rot):
                if socket_is_open(s.get("entry")):
                    local_open.append(s)
            for target in targets:
                for src in local_open:
                    if not sockets_compatible(src["entry"], target.get("entry")):
                        layout.reject("socket_mismatch", chunk["id"])
                        continue
                    if OPP[src["face"]] != target["face"]:
                        continue
                    pos = _align(chunk, rot, src, target)
                    if pos is None:
                        continue
                    ox, oy = pos
                    cells = _cells_of(chunk, ox, oy, rot)
                    if _overlaps(layout, cells):
                        layout.reject("overlap", chunk["id"])
                        continue
                    if _violates_neighbours(chunk, ox, oy, rot, layout):
                        layout.reject("blocked_neighbour", chunk["id"])
                        continue
                    placement = _commit(layout, chunk, ox, oy, rot, target)
                    if obj_idx is not None:
                        placement["objectiveIndex"] = obj_idx
                    if _place_next(depth + 1, queue, layout, tpl, chunks, rng):
                        return True
                    _rollback(layout)
    return False


def _try_attach(
    layout: _Layout,
    chunk: dict,
    targets: list[dict],
    rng: random.Random,
) -> bool:
    """Greedy one-chunk attach onto any of targets. Returns True if placed."""
    for rot in _shuffled(list(chunk.get("rotations") or [0]), rng):
        local_open = [s for s in _ports_world(chunk, 0, 0, rot) if socket_is_open(s.get("entry"))]
        for target in targets:
            for src in local_open:
                if not sockets_compatible(src["entry"], target.get("entry")):
                    continue
                if OPP[src["face"]] != target["face"]:
                    continue
                pos = _align(chunk, rot, src, target)
                if pos is None:
                    continue
                ox, oy = pos
                if _overlaps(layout, _cells_of(chunk, ox, oy, rot)):
                    continue
                if _violates_neighbours(chunk, ox, oy, rot, layout):
                    continue
                _commit(layout, chunk, ox, oy, rot, target)
                return True
    return False


def _branch_start_socks(layout: _Layout, rng: random.Random) -> list[dict]:
    """Prefer sockets that stick sideways off the main corridor."""
    socks = list(layout.open_sockets)
    if not socks:
        return []
    pref = getattr(layout, "pref_face", None)
    if not pref:
        return _shuffled(socks, rng)
    lateral = [s for s in socks if s.get("face") not in (pref, OPP.get(pref))]
    axial = [s for s in socks if s.get("face") in (pref, OPP.get(pref))]
    # Weight laterals heavily so Open/Branched grow real side arms
    mixed = _shuffled(lateral, rng) + _shuffled(lateral, rng) + _shuffled(axial, rng)
    return mixed[:32] if mixed else _shuffled(socks, rng)


def _place_side_branches(
    layout: _Layout,
    tpl: dict,
    chunks: list[dict],
    rng: random.Random,
) -> None:
    """Grow real side arms OFF the spine (rooms + halls), not 1-cell stubs."""
    budget = int(tpl.get("branchBudget") or 0)
    depth_max = int(tpl.get("branchDepthMax") or 0)
    if budget <= 0:
        return
    open_mode = str(tpl.get("openSocketScope") or "") == "all"
    # Open sprawl needs longer arms even if UI depth is low
    if open_mode and budget >= 6:
        depth_max = max(depth_max, 5)
    elif budget > 0:
        depth_max = max(depth_max, 2)
    placed = 0
    attempts = 0
    while placed < budget and attempts < budget * 4:
        attempts += 1
        starts = _branch_start_socks(layout, rng)
        if not starts:
            break
        # Length: Open gets 2..depth+2 chunk arms; Linear/branched 1..depth
        if open_mode and budget >= 6:
            blen = rng.randint(2, max(2, depth_max + 1))
        else:
            blen = rng.randint(1, max(1, depth_max))
        # Fat side rooms often; deadends only as tips
        roll = rng.random()
        if open_mode:
            if roll < 0.35:
                roles = ["room"]
            elif roll < 0.55:
                roles = ["connector", "room"]
            elif roll < 0.8:
                roles = ["connector"] * max(1, blen - 1) + ["room"]
            else:
                roles = ["connector"] * max(1, blen - 1) + ["deadend"]
        else:
            end_role = "room" if roll < 0.45 else "deadend"
            roles = (["connector"] * max(0, blen - 1)) + [end_role]

        grew = False
        for start in starts:
            tip = [start]
            steps = 0
            for ri, role in enumerate(roles):
                pool = _pool_for(role, chunks, tpl, layout, branch=True)
                if not pool:
                    break
                # First step off corridor: try bend connectors / rooms first
                if ri == 0 and role == "connector":
                    pool = sorted(
                        pool,
                        key=lambda c: (
                            0
                            if any(k in str(c.get("id") or "").upper() for k in ("CONN_L", "CONN_T"))
                            else 1
                        ),
                    )
                step_ok = False
                for chunk in pool[:10]:
                    if _try_attach(layout, chunk, tip, rng):
                        tip = layout.open_sockets_of_last()
                        step_ok = True
                        steps += 1
                        break
                if not step_ok:
                    break
            if steps > 0:
                placed += 1
                grew = True
                break
        if not grew:
            # Last resort: slap a deadend/room on any open socket
            for start in starts[:8]:
                for role in ("room", "deadend"):
                    pool = _pool_for(role, chunks, tpl, layout, branch=True)
                    for chunk in _shuffled(pool, rng)[:6]:
                        if _try_attach(layout, chunk, [start], rng):
                            placed += 1
                            grew = True
                            break
                    if grew:
                        break
                if grew:
                    break
            if not grew:
                break


def _role_entry(role: str, objective_index: int | None = None, prefer_large: bool = False) -> dict[str, Any]:
    return {
        "role": role,
        "objectiveIndex": objective_index,
        "preferLarge": prefer_large,
    }


def spine_roles_from_journey(steps: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
    """Expand Level.journey.steps → mid-spine role entries (entrance/exit added later).

    Wave/timer → wide objective arenas; boss → boss (fallback objective); travel → connectors.
    """
    if not steps:
        return None
    mid: list[dict[str, Any]] = []
    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            continue
        stype = str(step.get("type") or "wave").lower()
        if stype == "travel":
            try:
                length = max(1, int(step.get("lengthHint") or 2))
            except (TypeError, ValueError):
                length = 2
            for _ in range(length):
                mid.append(_role_entry("connector", i, False))
            # short room as travel waypoint / ArenaEnd
            mid.append(_role_entry("room", i, False))
        elif stype == "boss":
            mid.append(_role_entry("boss", i, True))
        else:
            # wave / timer — prefer larger objective rooms (arenas)
            mid.append(_role_entry("objective", i, True))
    return mid or None


def _expand_queue(
    tpl: dict,
    rng: random.Random,
    journey_steps: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    journey_mid = spine_roles_from_journey(journey_steps)
    if journey_mid is not None:
        # Auto entrance / exit — never hand-authored Start/End markers.
        spine_entries = [_role_entry("entrance")] + journey_mid + [_role_entry("exit")]
    else:
        raw = list(tpl.get("spine") or ["entrance", "room", "exit"])
        spine_entries = []
        for r in raw:
            if isinstance(r, dict):
                spine_entries.append(
                    _role_entry(
                        str(r.get("role") or "room"),
                        r.get("objectiveIndex"),
                        bool(r.get("preferLarge")),
                    )
                )
            else:
                spine_entries.append(_role_entry(str(r)))
        # Ensure entrance/exit bookends when using bare templates.
        roles = [e["role"] for e in spine_entries]
        if "entrance" not in roles:
            spine_entries.insert(0, _role_entry("entrance"))
        if "exit" not in roles:
            spine_entries.append(_role_entry("exit"))

    # Stretch main path: insert connector/room pads between spine beats (size / path length).
    try:
        size_scale = max(1, min(5, int(tpl.get("sizeScale") or 2)))
    except (TypeError, ValueError):
        size_scale = 2
    try:
        path_padding = max(0, min(12, int(tpl.get("pathPadding") or 0)))
    except (TypeError, ValueError):
        path_padding = 0
    pad = path_padding if path_padding else max(0, size_scale - 1)
    if pad > 0 and len(spine_entries) > 2:
        stretched: list[dict[str, Any]] = [spine_entries[0]]
        for i in range(1, len(spine_entries)):
            prev, cur = spine_entries[i - 1], spine_entries[i]
            # Don't pad inside already-dense travel connector runs; pad between landmarks.
            if prev.get("role") not in ("connector",) or cur.get("role") not in ("connector",):
                for p in range(pad):
                    # Alternate connector / room so long paths aren't pure hallways
                    stretched.append(_role_entry("connector" if p % 2 == 0 else "room"))
            stretched.append(cur)
        spine_entries = stretched

    # Side branches are NOT spliced into the spine — that made the blue main
    # path walk every dead-end. They are placed after the spine in generate_layout.
    return spine_entries


def _cap_and_fill(layout: _Layout, chunks: list[dict], rng: random.Random, fill_empty: bool = True) -> None:
    caps = [c for c in chunks if c.get("role") == "cap"]
    fillers = [c for c in chunks if c.get("role") == "filler"]
    # Cap open sockets
    open_copy = list(layout.open_sockets)
    for sock in open_copy:
        if sock not in layout.open_sockets:
            continue
        placed = False
        for cap in _shuffled(caps, rng):
            for rot in cap.get("rotations") or [0]:
                local_open = []
                socks = rotate_sockets(cap.get("sockets") or {}, rot)
                for face, entries in socks.items():
                    for i, entry in enumerate(entries):
                        if socket_is_open(entry):
                            local_open.append({"face": face, "index": i, "entry": entry})
                for src in local_open:
                    if OPP[src["face"]] != sock["face"]:
                        continue
                    if not sockets_compatible(src["entry"], sock.get("entry")):
                        continue
                    pos = _align(cap, rot, src, sock)
                    if pos is None:
                        continue
                    ox, oy = pos
                    if _overlaps(layout, _cells_of(cap, ox, oy, rot)):
                        continue
                    if _violates_neighbours(cap, ox, oy, rot, layout):
                        continue
                    _commit(layout, cap, ox, oy, rot, sock)
                    placed = True
                    break
                if placed:
                    break
            if placed:
                break
    # Filler pass: solid padded bounding box (outer wall ring + plug holes).
    # Off for open sprawl so the map keeps air gaps.
    if not fill_empty or not fillers or not layout.occupancy:
        return
    filler = min(fillers, key=lambda c: int(c.get("cw") or 1) * int(c.get("ch") or 1))
    fw, fh = int(filler.get("cw") or 1), int(filler.get("ch") or 1)
    xs = [c[0] for c in layout.occupancy]
    ys = [c[1] for c in layout.occupancy]
    min_x, max_x = min(xs) - 1, max(xs) + 1
    min_y, max_y = min(ys) - 1, max(ys) + 1
    # Cap runaway fill on huge sparse maps
    area = (max_x - min_x + 1) * (max_y - min_y + 1)
    if area > 4000:
        return
    for fy in range(min_y, max_y + 1, fh):
        for fx in range(min_x, max_x + 1, fw):
            cells = [(fx + dx, fy + dy) for dy in range(fh) for dx in range(fw)]
            if _overlaps(layout, cells):
                continue
            _commit(layout, filler, fx, fy, 0, None)


def flatten_layout(layout: _Layout, chunks_by_id: dict[str, dict]) -> tuple[dict, int, int, list[list[str]]]:
    """Return sparse grid dict, w, h, and dense terrain for pathfinding (shifted to 0,0)."""
    if not layout.occupancy:
        return {"_sparse": True, "cells": {}}, 1, 1, [["empty"]]
    xs = [c[0] for c in layout.occupancy]
    ys = [c[1] for c in layout.occupancy]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    w = max_x - min_x + 1
    h = max_y - min_y + 1
    cells: dict[str, dict] = {}
    dense: list[list[str]] = [["empty"] for _ in range(h)]
    dense = [["empty" for _ in range(w)] for _ in range(h)]
    for p in layout.placements:
        ch = chunks_by_id.get(p["chunkId"])
        if not ch:
            continue
        g = rotate_grid(ch.get("grid") or [], p["rot"])
        for ly, row in enumerate(g):
            for lx, terr in enumerate(row):
                if not terr or terr == "empty":
                    continue  # notches stay free for other pieces
                gx = p["cx"] - min_x + lx
                gy = p["cy"] - min_y + ly
                if 0 <= gx < w and 0 <= gy < h:
                    dense[gy][gx] = terr
                    cells[f"{gx},{gy}"] = {"terrain": terr, "entity": None}
    # Shift placements for level storage
    for p in layout.placements:
        p["cx"] -= min_x
        p["cy"] -= min_y
        for s in p.get("slots") or []:
            s["x"] = int(s.get("x") or 0) - min_x
            s["y"] = int(s.get("y") or 0) - min_y
    return {"_sparse": True, "cells": cells}, w, h, dense


def _walkable(terr: str) -> bool:
    return terr in ("floor", "door", "open") or terr == "door"


def find_main_path(dense: list[list[str]], entrance: tuple[int, int] | None, exit_: tuple[int, int] | None) -> list[list[int]]:
    if not entrance or not exit_ or not dense:
        return []
    h, w = len(dense), len(dense[0])

    def neigh(x, y):
        for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and dense[ny][nx] in ("floor", "door"):
                yield nx, ny

    start, goal = entrance, exit_
    q = deque([start])
    prev: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
    while q:
        cur = q.popleft()
        if cur == goal:
            break
        for n in neigh(*cur):
            if n not in prev:
                prev[n] = cur
                q.append(n)
    if goal not in prev:
        return []
    path = []
    cur: tuple[int, int] | None = goal
    while cur is not None:
        path.append([cur[0], cur[1]])
        cur = prev[cur]
    path.reverse()
    return path


def _role_cell(layout: _Layout, role: str, min_x: int, min_y: int) -> tuple[int, int] | None:
    for p in layout.placements:
        if p.get("role") == role:
            # center of chunk
            return (p["cx"] - min_x + p["cw"] // 2, p["cy"] - min_y + p["ch"] // 2)
    return None


def validate_layout(
    layout: _Layout,
    dense: list[list[str]],
    w: int,
    h: int,
    tpl: dict,
) -> tuple[bool, str, list[list[int]]]:
    if not layout.placements:
        return False, "empty", []
    # Find entrance/exit centers in dense coords (placements already shifted)
    ent = None
    ext = None
    obj = None
    for p in layout.placements:
        cx = p["cx"] + p["cw"] // 2
        cy = p["cy"] + p["ch"] // 2
        if p.get("role") == "entrance":
            ent = (cx, cy)
        elif p.get("role") == "exit":
            ext = (cx, cy)
        elif p.get("role") == "objective":
            obj = (cx, cy)
    if not ent:
        return False, "no_entrance", []
    if not ext:
        return False, "no_exit", []
    # Snap to nearest walkable
    def snap(pt):
        x, y = pt
        if 0 <= x < w and 0 <= y < h and dense[y][x] in ("floor", "door"):
            return pt
        for r in range(1, 4):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and dense[ny][nx] in ("floor", "door"):
                        return (nx, ny)
        return pt

    ent, ext = snap(ent), snap(ext)
    path = find_main_path(dense, ent, ext)
    if not path:
        return False, "unreachable_exit", []
    if obj:
        obj = snap(obj)
        if not find_main_path(dense, ent, obj):
            return False, "unreachable_objective", path
    metrics = tpl.get("metrics") or {}
    band = metrics.get("mainPathLen") or [1, 9999]
    lo, hi = int(band[0]), int(band[1])
    if not (lo <= len(path) <= hi):
        return False, f"metrics_path_len:{len(path)}", path
    return True, "ok", path


def stamp_include_on_grid(
    grid: dict[str, Any],
    layout: list[dict[str, Any]],
    include: dict[str, Any] | None,
    rng: random.Random,
) -> dict[str, Any]:
    """Stamp checked NPC/item ids onto Slot_B (spawns) / Slot_A (starts) cells and loose floors."""
    if not isinstance(grid, dict) or not grid.get("_sparse"):
        return grid
    cells = grid.setdefault("cells", {})
    npc_ids = [str(x) for x in ((include or {}).get("npcIds") or []) if x]
    item_ids = [str(x) for x in ((include or {}).get("itemIds") or []) if x]
    if not npc_ids and not item_ids:
        return grid

    def put_entity(x: int, y: int, kind: str, eid: str) -> None:
        key = f"{x},{y}"
        c = cells.get(key) or {"terrain": "floor", "entity": None}
        if c.get("terrain") in (None, "empty", "wall"):
            c["terrain"] = "floor"
        c["entity"] = {"kind": kind, "id": eid}
        cells[key] = c

    npc_i = 0
    item_i = 0
    for p in layout or []:
        slots = p.get("slots") or []
        role = p.get("role") or ""
        for s in slots:
            group = str(s.get("group") or "").upper()
            x, y = int(s.get("x") or 0), int(s.get("y") or 0)
            # Tag slot markers for layer preview (non-entity)
            key = f"{x},{y}"
            marker = cells.get(key) or {"terrain": "floor", "entity": None}
            if marker.get("terrain") in (None, "empty"):
                marker["terrain"] = "floor"
            marker["slot"] = "A" if group == "A" else ("B" if group == "B" else group)
            if p.get("objectiveIndex") is not None:
                marker["objectiveIndex"] = p.get("objectiveIndex")
            cells[key] = marker
            if group == "B" and npc_ids:
                put_entity(x, y, "npc", npc_ids[npc_i % len(npc_ids)])
                npc_i += 1
            elif group == "A" and role in ("entrance", "room", "objective", "boss") and item_ids and rng.random() < 0.25:
                put_entity(x, y, "item", item_ids[item_i % len(item_ids)])
                item_i += 1
        # Boss / objective arenas: sprinkle remaining NPCs on floors if slots empty
        if role in ("objective", "boss") and npc_ids and not slots:
            cx, cy = int(p.get("cx") or 0), int(p.get("cy") or 0)
            cw, ch = int(p.get("cw") or 1), int(p.get("ch") or 1)
            put_entity(cx + cw // 2, cy + ch // 2, "npc", npc_ids[npc_i % len(npc_ids)])
            npc_i += 1
    return grid


def generate_layout(
    chunks: list[dict[str, Any]],
    template: dict[str, Any],
    seed: int | None = None,
    journey_steps: list[dict[str, Any]] | None = None,
    include: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generate a layout. Returns result blob with ok/error, layout, grid, stats, trace, attempts."""
    tpl = normalize_template(template)
    chunk_list = [normalize_chunk(c) for c in chunks]
    chunks_by_id = {c["id"]: c for c in chunk_list}
    base_seed = int(seed if seed is not None else tpl.get("seed") or 0)
    max_attempts = int(tpl.get("maxAttempts") or 25)
    attempts_log: list[dict] = []
    agg_rej: dict[str, int] = {}

    for attempt in range(max_attempts):
        attempt_seed = base_seed + attempt * 9973
        rng = _stage_seed(attempt_seed, "spine")
        queue = _expand_queue(tpl, rng, journey_steps=journey_steps)
        spine_used = [e["role"] for e in queue]
        layout = _Layout()
        place_rng = _stage_seed(attempt_seed, "place")
        ok_place = _place_next(0, queue, layout, tpl, chunk_list, place_rng)
        if not ok_place:
            reason = "placement_failed"
            attempts_log.append({"attempt": attempt, "seed": attempt_seed, "ok": False, "reason": reason, "rollbacks": layout.rollbacks})
            for k, v in layout.rejections.items():
                agg_rej[k] = agg_rej.get(k, 0) + v
            continue

        spine_snap = layout.snapshot_placements()
        branch_rng = _stage_seed(attempt_seed, "branch")
        _place_side_branches(layout, tpl, chunk_list, branch_rng)
        branch_snap = layout.snapshot_placements()
        cap_rng = _stage_seed(attempt_seed, "cap")
        # Indoor / linear: default wall surround when fillEmpty omitted
        fill_empty = tpl.get("fillEmpty")
        if fill_empty is None:
            fill_empty = (tpl.get("space") or "inside") == "inside"
        _cap_and_fill(layout, chunk_list, cap_rng, fill_empty=bool(fill_empty))
        # Flatten (mutates placement coords to 0-based)
        grid, w, h, dense = flatten_layout(layout, chunks_by_id)
        valid, reason, main_path = validate_layout(layout, dense, w, h, tpl)
        for k, v in layout.rejections.items():
            agg_rej[k] = agg_rej.get(k, 0) + v
        if not valid:
            attempts_log.append({
                "attempt": attempt, "seed": attempt_seed, "ok": False,
                "reason": reason, "rollbacks": layout.rollbacks,
            })
            continue

        placements = layout.snapshot_placements()
        stamp_rng = _stage_seed(attempt_seed, "stamp")
        grid = stamp_include_on_grid(grid, placements, include, stamp_rng)

        walkable = sum(1 for row in dense for t in row if t in ("floor", "door"))
        ratio = round(walkable / max(1, len(main_path)), 2)
        trace = [
            {"stage": "spine", "placements": spine_snap},
            {"stage": "branches", "placements": branch_snap},
            {"stage": "caps_fillers", "placements": layout.snapshot_placements()},
            {"stage": "final", "placements": placements, "mainPath": main_path},
        ]
        role_health = {}
        for role in set(spine_used):
            role_health[role] = len(_pool_for(role, chunk_list, tpl, _Layout()))

        result = {
            "ok": True,
            "seed": attempt_seed,
            "templateId": tpl.get("id"),
            "layout": placements,
            "grid": grid,
            "w": w,
            "h": h,
            "mainPath": main_path,
            "spineUsed": spine_used,
            "stats": {
                "chunksPlaced": len(layout.placements),
                "mainPathLen": len(main_path),
                "walkable": walkable,
                "walkableToPathRatio": ratio,
                "rollbacks": layout.rollbacks,
                "attempts": attempt + 1,
                "seed": attempt_seed,
            },
            "trace": trace,
            "attemptsLog": attempts_log + [{"attempt": attempt, "seed": attempt_seed, "ok": True, "reason": "ok", "rollbacks": layout.rollbacks}],
            "rejectionHistogram": agg_rej,
            "chunkSetHealth": role_health,
            "hints": _hints(agg_rej, role_health, spine_used),
        }
        return result

    return {
        "ok": False,
        "error": "failed_after_attempts",
        "maxAttempts": max_attempts,
        "attemptsLog": attempts_log,
        "rejectionHistogram": agg_rej,
        "hints": _hints(agg_rej, {}, list(tpl.get("spine") or [])),
        "stats": {"attempts": max_attempts, "rollbacks": sum(a.get("rollbacks") or 0 for a in attempts_log), "seed": base_seed},
    }


def _hints(rej: dict[str, int], health: dict[str, int], spine: list) -> list[str]:
    hints = []
    for role in spine:
        role_s = role["role"] if isinstance(role, dict) else str(role)
        if health.get(role_s, 1) == 0:
            hints.append(f"No eligible chunks for role '{role_s}' under current tags/space — widen the tag filter or add chunks.")
    total = sum(rej.values()) or 1
    top = sorted(rej.items(), key=lambda kv: -kv[1])[:3]
    for k, v in top:
        if "overlap" in k:
            hints.append("High overlap rejections — add straight opposite-socket connectors to create spacing.")
        elif "socket_mismatch" in k:
            hints.append("Socket mismatches — reduce distinct socket kinds or align door/open sizes.")
        elif "no_candidates" in k:
            hints.append(f"Missing candidates ({k}) — add chunks for that role.")
    if not hints:
        hints.append("Aim for any single layout using ~15–20% of the chunk pool; add simple opposite-portal connectors if rollbacks are high.")
    return hints[:5]


def placement_hash(layout_placements: list[dict]) -> str:
    blob = "|".join(
        f"{p.get('chunkId')}:{p.get('cx')}:{p.get('cy')}:{p.get('rot')}"
        for p in sorted(layout_placements, key=lambda p: (p.get("cy") or 0, p.get("cx") or 0, p.get("chunkId") or ""))
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]
