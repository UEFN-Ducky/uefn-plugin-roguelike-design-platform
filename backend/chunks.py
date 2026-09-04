"""Chunk catalogue helpers — footprints, sockets, starter set, templates."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

DIRS = ("N", "E", "S", "W")
OPEN_KINDS = frozenset({"open", "door", "ledge", "window"})
WALL_KINDS = frozenset({"wall", "void"})
OPP = {"N": "S", "S": "N", "E": "W", "W": "E"}
FACE_DELTA = {"N": (0, -1), "E": (1, 0), "S": (0, 1), "W": (-1, 0)}
FACE_CW = {"N": "E", "E": "S", "S": "W", "W": "N"}
SOLID_TERRAIN = frozenset({"floor", "wall", "door", "open"})


def cell_solid(terr: Any) -> bool:
    return str(terr or "empty").lower() in SOLID_TERRAIN


def _sock(kind: str, size: int = 1, height_step: int = 0) -> dict[str, Any]:
    return {"kind": kind, "size": size, "height_step": height_step, "z": height_step}


def _edge(kinds: list) -> list[dict[str, Any]]:
    """Edge sockets: 'door' | ('ledge', z) | {kind, height_step}."""
    out: list[dict[str, Any]] = []
    for k in kinds or []:
        if isinstance(k, dict):
            out.append(
                _sock(
                    str(k.get("kind") or "wall"),
                    int(k.get("size") or 1),
                    int(k.get("height_step") or k.get("z") or 0),
                )
            )
        elif isinstance(k, (list, tuple)) and k:
            out.append(_sock(str(k[0]), 1, int(k[1]) if len(k) > 1 else 0))
        else:
            out.append(_sock(str(k)))
    return out


def derive_footprint(cw: int, ch: int, sockets: dict[str, list]) -> list[list[str]]:
    """Auto-derive a 2D terrain grid from edge sockets.

    Openings win over walls at corners so a full-edge door isn't sealed by
    an adjacent wall socket on the perpendicular face.
    """
    cw = max(1, int(cw))
    ch = max(1, int(ch))
    grid = [["floor" for _ in range(cw)] for _ in range(ch)]
    rank = {"empty": 0, "floor": 1, "wall": 2, "door": 3}

    def kind_at(face: str, i: int, entries: list) -> str:
        n = len(entries)
        if not n:
            return "wall"
        idx = min(i, n - 1) if n == (cw if face in ("N", "S") else ch) else int(i * n / max(1, (cw if face in ("N", "S") else ch)))
        return str((entries[idx] or {}).get("kind") or "wall").lower()

    def set_cell(y: int, x: int, terr: str) -> None:
        cur = grid[y][x]
        # Prefer door > wall > floor so openings aren't sealed by corner walls.
        if terr == "door" or terr == "floor" and cur == "wall":
            if terr == "floor" and cur == "door":
                return
            if terr == "floor" and cur == "wall":
                # opening on this edge beats wall from the other edge
                grid[y][x] = "floor"
                return
        if rank.get(terr, 0) >= rank.get(cur, 0):
            grid[y][x] = terr

    socks = sockets or {}
    # Pass 1: walls
    for face in DIRS:
        entries = list(socks.get(face) or [])
        if face in ("N", "S"):
            y = 0 if face == "N" else ch - 1
            for i in range(cw):
                k = kind_at(face, i, entries)
                if k in ("wall", "void"):
                    set_cell(y, i, "wall")
        else:
            x = cw - 1 if face == "E" else 0
            for i in range(ch):
                k = kind_at(face, i, entries)
                if k in ("wall", "void"):
                    set_cell(i, x, "wall")
    # Pass 2: openings overwrite walls at the same edge cell
    for face in DIRS:
        entries = list(socks.get(face) or [])
        if face in ("N", "S"):
            y = 0 if face == "N" else ch - 1
            for i in range(cw):
                k = kind_at(face, i, entries)
                if k == "door":
                    set_cell(y, i, "door")
                elif k in ("open", "ledge", "window"):
                    set_cell(y, i, "floor")
        else:
            x = cw - 1 if face == "E" else 0
            for i in range(ch):
                k = kind_at(face, i, entries)
                if k == "door":
                    set_cell(i, x, "door")
                elif k in ("open", "ledge", "window"):
                    set_cell(i, x, "floor")
    return grid


def _chunk(
    id_: str,
    name: str,
    cw: int,
    ch: int,
    role: str,
    sockets: dict[str, list],
    *,
    cz: int = 1,
    space: str = "inside",
    roof: bool = True,
    tags: list[str] | None = None,
    weight: float = 1.0,
    rotations: list[int] | None = None,
    slots: list[dict] | None = None,
    prefab_path: str = "",
) -> dict[str, Any]:
    sock = {d: _edge(sockets.get(d) or ["wall"] * (cw if d in ("N", "S") else ch)) for d in DIRS}
    # pad / trim to edge length
    for d in DIRS:
        need = cw if d in ("N", "S") else ch
        cur = sock[d]
        if len(cur) < need:
            cur = cur + [_sock("wall")] * (need - len(cur))
        sock[d] = cur[:need]
    grid = derive_footprint(cw, ch, sock)
    return {
        "id": id_,
        "name": name,
        "prefabPath": prefab_path,
        "cw": cw,
        "ch": ch,
        "cz": max(1, int(cz)),
        "space": space,
        "role": role,
        "roof": bool(roof),
        "sockets": sock,
        "rotations": rotations if rotations is not None else [0, 90, 180, 270],
        "mirror": False,
        "weight": float(weight),
        "minCount": None,
        "maxCount": None,
        "tags": list(tags or ["ruins"]),
        "slots": list(slots or []),
        "grid": grid,
        "gridAuto": True,
    }


def normalize_chunk(raw: dict[str, Any]) -> dict[str, Any]:
    """Fill missing fields; re-derive grid when gridAuto; keep polyomino empty cells + ports."""
    c = deepcopy(raw) if isinstance(raw, dict) else {}
    cw = max(1, int(c.get("cw") or 1))
    ch = max(1, int(c.get("ch") or 1))
    # cz = stories (cell height). 2×2×4 → cw=2, ch=2, cz=4.
    try:
        cz = int(c.get("cz") if c.get("cz") is not None else c.get("stories") or 1)
    except (TypeError, ValueError):
        cz = 1
    cz = max(1, min(16, cz))
    c["cw"], c["ch"], c["cz"] = cw, ch, cz
    c.setdefault("id", "chk_unnamed")
    c.setdefault("name", c["id"])
    c["prefabPath"] = normalize_uefn_content_path(str(c.get("prefabPath") or ""))
    c["contentPath"] = content_disk_path(c["prefabPath"]) if c["prefabPath"] else ""
    c.setdefault("space", "inside")
    c.setdefault("role", "room")
    c.setdefault("roof", c.get("space") == "inside")
    c.setdefault("rotations", [0, 90, 180, 270])
    c.setdefault("mirror", False)
    c.setdefault("weight", 1.0)
    c.setdefault("minCount", None)
    c.setdefault("maxCount", None)
    c.setdefault("tags", [])
    c.setdefault("slots", [])
    c.setdefault("props", [])
    c.setdefault("gridAuto", True)
    c.setdefault("shape", "")
    # Verse catalogue entry class (Roguelike project) — Slot_A/B → Player/EnemySlotProps
    c.setdefault("verseClass", "rgd_chunk_entry")
    props_norm = []
    for p in c.get("props") or []:
        np = normalize_chunk_prop(p, cw, ch)
        if np:
            props_norm.append(np)
    c["props"] = props_norm
    socks = c.get("sockets") if isinstance(c.get("sockets"), dict) else {}
    norm_socks: dict[str, list] = {}
    for d in DIRS:
        need = cw if d in ("N", "S") else ch
        entries = list(socks.get(d) or [])
        out = []
        for i in range(need):
            src = entries[i] if i < len(entries) else {"kind": "wall"}
            if isinstance(src, str):
                src = {"kind": src}
            elif isinstance(src, (list, tuple)) and src:
                src = {
                    "kind": src[0],
                    "height_step": int(src[1]) if len(src) > 1 else 0,
                }
            kind = str((src or {}).get("kind") or "wall").lower()
            out.append(_sock(kind, int((src or {}).get("size") or 1), int((src or {}).get("height_step") or (src or {}).get("z") or 0)))
        norm_socks[d] = out
    c["sockets"] = norm_socks
    if c.get("gridAuto") or not c.get("grid"):
        c["grid"] = derive_footprint(cw, ch, norm_socks)
    else:
        # Normalize grid size; preserve empty for Tetris footprints
        g_in = c.get("grid") or []
        g = []
        for y in range(ch):
            src = g_in[y] if y < len(g_in) else []
            row = []
            for x in range(cw):
                terr = str(src[x] if x < len(src) else "floor").lower()
                if terr not in ("empty", "floor", "wall", "door", "open"):
                    terr = "floor"
                row.append(terr)
            g.append(row)
        c["grid"] = g
    ports_in = c.get("ports") if isinstance(c.get("ports"), list) else []
    ports = [normalize_port(p) for p in ports_in]
    ports = [p for p in ports if p and 0 <= p["x"] < cw and 0 <= p["y"] < ch]
    if not ports:
        ports = ports_from_bbox_sockets(cw, ch, norm_socks, c.get("grid"))
    c["ports"] = ports
    # Keep bbox sockets in sync for UI edge legend when poly authored
    if not c.get("gridAuto"):
        c["sockets"] = bbox_sockets_from_ports(cw, ch, ports, c["grid"])
    return c


def rotate_chunk_dims(cw: int, ch: int, rot: int) -> tuple[int, int]:
    rot = int(rot) % 360
    if rot in (90, 270):
        return ch, cw
    return cw, ch


def rotate_sockets(sockets: dict[str, list], rot: int) -> dict[str, list]:
    """Rotate socket map by 0/90/180/270 clockwise."""
    rot = int(rot) % 360
    order = list(DIRS)
    steps = {0: 0, 90: 1, 180: 2, 270: 3}.get(rot, 0)
    if steps == 0:
        return {d: list(sockets.get(d) or []) for d in DIRS}
    out: dict[str, list] = {}
    for i, d in enumerate(order):
        src = order[(i - steps) % 4]
        entries = list(sockets.get(src) or [])
        # When rotating 90/270, N/S length becomes E/W length — entries already match src edge.
        out[d] = entries
    return out


def rotate_xy(x: int, y: int, cw: int, ch: int, rot: int) -> tuple[int, int]:
    rot = int(rot) % 360
    if rot == 90:
        return ch - 1 - y, x
    if rot == 180:
        return cw - 1 - x, ch - 1 - y
    if rot == 270:
        return y, cw - 1 - x
    return x, y


def rotate_face(face: str, rot: int) -> str:
    f = face if face in FACE_CW else "N"
    for _ in range((int(rot) % 360) // 90):
        f = FACE_CW[f]
    return f


def normalize_port(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    face = str(raw.get("face") or "").upper()
    if face not in DIRS:
        return None
    try:
        x, y = int(raw.get("x")), int(raw.get("y"))
    except (TypeError, ValueError):
        return None
    kind = str(raw.get("kind") or "wall").lower()
    return {
        "x": x,
        "y": y,
        "face": face,
        "kind": kind,
        "size": int(raw.get("size") or 1),
        "height_step": int(raw.get("height_step") or raw.get("z") or 0),
        "z": int(raw.get("height_step") or raw.get("z") or 0),
    }


def ports_from_bbox_sockets(cw: int, ch: int, sockets: dict[str, list], grid: list[list[str]] | None = None) -> list[dict[str, Any]]:
    """Legacy rectangle chunks: one port per bbox-edge socket on a solid cell."""
    ports: list[dict[str, Any]] = []
    socks = sockets or {}
    for face in DIRS:
        entries = list(socks.get(face) or [])
        for i, entry in enumerate(entries):
            if face == "N":
                x, y = i, 0
            elif face == "S":
                x, y = i, ch - 1
            elif face == "E":
                x, y = cw - 1, i
            else:
                x, y = 0, i
            if grid is not None:
                if y < 0 or y >= len(grid) or x < 0 or x >= len(grid[y]) or not cell_solid(grid[y][x]):
                    continue
            if isinstance(entry, str):
                entry = {"kind": entry}
            ports.append(
                {
                    "x": x,
                    "y": y,
                    "face": face,
                    "kind": str((entry or {}).get("kind") or "wall").lower(),
                    "size": int((entry or {}).get("size") or 1),
                    "height_step": int((entry or {}).get("height_step") or (entry or {}).get("z") or 0),
                    "z": int((entry or {}).get("height_step") or (entry or {}).get("z") or 0),
                }
            )
    return ports


def bbox_sockets_from_ports(cw: int, ch: int, ports: list[dict[str, Any]], grid: list[list[str]]) -> dict[str, list]:
    """Preview/compat edge arrays — void where the bbox cell is empty."""
    by: dict[tuple[str, int], dict[str, Any]] = {}
    for p in ports:
        face = p["face"]
        if face == "N" and p["y"] == 0:
            by[(face, p["x"])] = p
        elif face == "S" and p["y"] == ch - 1:
            by[(face, p["x"])] = p
        elif face == "E" and p["x"] == cw - 1:
            by[(face, p["y"])] = p
        elif face == "W" and p["x"] == 0:
            by[(face, p["y"])] = p
    out: dict[str, list] = {}
    for face in DIRS:
        need = cw if face in ("N", "S") else ch
        edge = []
        for i in range(need):
            if face == "N":
                x, y = i, 0
            elif face == "S":
                x, y = i, ch - 1
            elif face == "E":
                x, y = cw - 1, i
            else:
                x, y = 0, i
            if y >= len(grid) or x >= len(grid[y]) or not cell_solid(grid[y][x]):
                edge.append(_sock("void"))
            elif (face, i) in by:
                p = by[(face, i)]
                edge.append(_sock(p.get("kind") or "wall", int(p.get("size") or 1), int(p.get("height_step") or 0)))
            else:
                edge.append(_sock("wall"))
        out[face] = edge
    return out


def rotate_ports(ports: list[dict[str, Any]], cw: int, ch: int, rot: int) -> list[dict[str, Any]]:
    rot = int(rot) % 360
    if not rot:
        return [dict(p) for p in ports]
    out = []
    for p in ports:
        x, y = rotate_xy(int(p["x"]), int(p["y"]), cw, ch, rot)
        out.append({
            **p,
            "x": x,
            "y": y,
            "face": rotate_face(str(p.get("face") or "N"), rot),
        })
    return out


def ensure_ports(chunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Return normalized ports; synthesize from bbox sockets when missing."""
    raw = chunk.get("ports")
    if isinstance(raw, list) and raw:
        ports = [normalize_port(p) for p in raw]
        return [p for p in ports if p]
    return ports_from_bbox_sockets(
        int(chunk.get("cw") or 1),
        int(chunk.get("ch") or 1),
        chunk.get("sockets") or {},
        chunk.get("grid"),
    )


def occupied_cells(chunk: dict[str, Any], rot: int = 0) -> list[tuple[int, int]]:
    """Local solid cells after rotation (empty = not part of the piece)."""
    g = rotate_grid(chunk.get("grid") or [], rot)
    cells = []
    for y, row in enumerate(g):
        for x, terr in enumerate(row):
            if cell_solid(terr):
                cells.append((x, y))
    if cells:
        return cells
    # Fallback solid bbox for broken grids
    cw, ch = rotate_chunk_dims(int(chunk.get("cw") or 1), int(chunk.get("ch") or 1), rot)
    return [(x, y) for y in range(ch) for x in range(cw)]


def _parse_mask(mask: list[str]) -> list[list[str]]:
    rows = [str(r) for r in mask]
    if not rows:
        return [["floor"]]
    w = max(len(r) for r in rows)
    grid = []
    for r in rows:
        row = []
        for ch_ in r.ljust(w, "."):
            row.append("floor" if ch_ in "#XxFf" else "empty")
        grid.append(row)
    return grid


def _poly_chunk(
    id_: str,
    name: str,
    mask: list[str],
    role: str,
    doors: list[tuple],
    *,
    cz: int = 1,
    ledges: list[tuple] | None = None,
    space: str = "inside",
    roof: bool = True,
    tags: list[str] | None = None,
    weight: float = 1.0,
    rotations: list[int] | None = None,
    slots: list[dict] | None = None,
    props: list[dict] | None = None,
    prefab_path: str = "",
    shape: str = "",
) -> dict[str, Any]:
    """Tetris-style chunk: mask of #/., door/ledge ports (optional height_step)."""
    grid = _parse_mask(mask)
    ch, cw = len(grid), len(grid[0])
    # doors: (x,y,face) or (x,y,face,height_step)
    door_z: dict[tuple[int, int, str], int] = {}
    for d in doors or []:
        x, y, face = int(d[0]), int(d[1]), str(d[2]).upper()
        door_z[(x, y, face)] = int(d[3]) if len(d) > 3 else 0
    ledge_z: dict[tuple[int, int, str], int] = {}
    for d in ledges or []:
        x, y, face = int(d[0]), int(d[1]), str(d[2]).upper()
        ledge_z[(x, y, face)] = int(d[3]) if len(d) > 3 else 1
    ports: list[dict[str, Any]] = []
    for y in range(ch):
        for x in range(cw):
            if not cell_solid(grid[y][x]):
                continue
            for face, (dx, dy) in FACE_DELTA.items():
                nx, ny = x + dx, y + dy
                outside = nx < 0 or ny < 0 or nx >= cw or ny >= ch or not cell_solid(grid[ny][nx])
                if not outside:
                    continue
                key = (x, y, face)
                if key in door_z:
                    kind, hz = "door", door_z[key]
                elif key in ledge_z:
                    kind, hz = "ledge", ledge_z[key]
                else:
                    kind, hz = "wall", 0
                ports.append(_sock(kind, 1, hz) | {"x": x, "y": y, "face": face})
                if kind == "door":
                    grid[y][x] = "door"
    socks = bbox_sockets_from_ports(cw, ch, ports, grid)
    return {
        "id": id_,
        "name": name,
        "prefabPath": prefab_path,
        "cw": cw,
        "ch": ch,
        "cz": max(1, int(cz)),
        "space": space,
        "role": role,
        "roof": bool(roof),
        "sockets": socks,
        "ports": ports,
        "shape": shape or id_,
        "rotations": rotations if rotations is not None else [0, 90, 180, 270],
        "mirror": False,
        "weight": float(weight),
        "minCount": None,
        "maxCount": None,
        "tags": list(tags or ["ruins"]),
        "slots": list(slots or []),
        "props": list(props or []),
        "grid": grid,
        "gridAuto": False,
    }


def rotate_grid(grid: list[list[str]], rot: int) -> list[list[str]]:
    rot = int(rot) % 360
    if not grid:
        return grid
    g = [list(row) for row in grid]
    if rot == 0:
        return g
    if rot == 90:
        # clockwise: (x,y) -> (h-1-y, x)
        h, w = len(g), len(g[0])
        return [[g[h - 1 - x][y] for x in range(h)] for y in range(w)]
    if rot == 180:
        return [list(reversed(row)) for row in reversed(g)]
    if rot == 270:
        h, w = len(g), len(g[0])
        return [[g[x][w - 1 - y] for x in range(h)] for y in range(w)]
    return g


def socket_is_open(entry: dict | None) -> bool:
    kind = str((entry or {}).get("kind") or "wall").lower()
    return kind in OPEN_KINDS


def sockets_compatible(a: dict | None, b: dict | None) -> bool:
    """Both open of same size/height, or both closed."""
    a = a or {"kind": "wall", "size": 1, "height_step": 0}
    b = b or {"kind": "wall", "size": 1, "height_step": 0}
    ao, bo = socket_is_open(a), socket_is_open(b)
    if ao != bo:
        return False
    if int(a.get("size") or 1) != int(b.get("size") or 1):
        return False
    if int(a.get("height_step") or a.get("z") or 0) != int(b.get("height_step") or b.get("z") or 0):
        return False
    return True


# ---------------------------------------------------------------------------
# Placeable props (columns etc.) — Content mesh/prefab paths for chunk paint.
# ---------------------------------------------------------------------------

# Kit pieces combine into rooms (Three.js preview uses `preview` shape).
# assetPath is always a UEFN Content mount (/Roguelike/… = Content/…).
DEFAULT_CHUNK_ASSETS: list[dict[str, Any]] = [
    {
        "id": "kit_floor_512",
        "name": "Floor Tile 512",
        "assetPath": "/Roguelike/Meshes/SM_TileFloor512",
        "kind": "floor",
        "preview": "floor",
    },
    {
        "id": "kit_wall",
        "name": "Wall Panel",
        "assetPath": "/Roguelike/Meshes/SM_TileWall",
        "kind": "wall",
        "preview": "wall",
    },
    {
        "id": "kit_roof",
        "name": "Roof Slab",
        "assetPath": "/Roguelike/Meshes/SM_TileFloor512",
        "kind": "roof",
        "preview": "roof",
    },
    {
        "id": "kit_arch",
        "name": "Arch Gate",
        "assetPath": "/Roguelike/Meshes/SM_TileWall",
        "kind": "arch",
        "preview": "arch",
    },
    {
        "id": "kit_door",
        "name": "Door Frame",
        "assetPath": "/Roguelike/Meshes/SM_TileWall",
        "kind": "door",
        "preview": "door",
    },
    {
        "id": "kit_column",
        "name": "Column",
        "assetPath": "/Roguelike/Stylized_Egypt/Meshes/building/SM_building_column_01",
        "kind": "column",
        "preview": "column",
    },
    {
        "id": "col_egypt_01",
        "name": "Egypt Column 01",
        "assetPath": "/Roguelike/Stylized_Egypt/Meshes/building/SM_building_column_01",
        "kind": "column",
        "preview": "column",
    },
    {
        "id": "col_egypt_02",
        "name": "Egypt Column 02",
        "assetPath": "/Roguelike/Stylized_Egypt/Meshes/building/SM_building_column_02",
        "kind": "column",
        "preview": "column",
    },
    {
        "id": "pillar_stair",
        "name": "Stair Pillar",
        "assetPath": "/Roguelike/MagicianLabatory/Source/Building/Stair_Pillar15/SM_Stair_Pillar15",
        "kind": "column",
        "preview": "column",
    },
    {
        "id": "tile_cube",
        "name": "Tile Cube",
        "assetPath": "/Roguelike/Meshes/SM_TileCube",
        "kind": "prop",
        "preview": "cube",
    },
]


def content_disk_path(ue_path: str) -> str:
    """'/Roguelike/Prefabs/X' → 'Content/Prefabs/X' (display / disk under project)."""
    s = str(ue_path or "").strip().replace("\\", "/")
    if not s:
        return ""
    if s.startswith("Content/"):
        return s
    if s.startswith("/"):
        parts = s.strip("/").split("/", 1)
        if len(parts) == 2:
            return "Content/" + parts[1]
        return "Content/" + parts[0]
    return "Content/" + s.lstrip("/")


def normalize_uefn_content_path(raw: str, mount: str = "Roguelike") -> str:
    """Accept Content/… or /Mount/…; always store UEFN mount path under project Content."""
    s = str(raw or "").strip().replace("\\", "/")
    if not s:
        return ""
    mount = (mount or "Roguelike").strip("/") or "Roguelike"
    if s.startswith("Content/"):
        return f"/{mount}/" + s[len("Content/") :]
    if s.startswith("/"):
        return s
    return f"/{mount}/" + s.lstrip("/")


def normalize_chunk_asset(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    aid = str(raw.get("id") or "").strip()
    path = normalize_uefn_content_path(str(raw.get("assetPath") or raw.get("path") or ""))
    if not aid:
        return None
    # Preview-only kit pieces may omit path until assigned
    kind = str(raw.get("kind") or "prop")
    preview = str(raw.get("preview") or kind or "prop")
    if not path and not preview:
        return None
    return {
        "id": aid,
        "name": str(raw.get("name") or aid),
        "assetPath": path,
        "kind": kind,
        "preview": preview,
        "contentPath": content_disk_path(path) if path else "",
        "source": str(raw.get("source") or "catalogue"),
    }


def normalize_chunk_prop(raw: Any, cw: int = 1, ch: int = 1) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    try:
        x, y = int(raw.get("x") or 0), int(raw.get("y") or 0)
    except (TypeError, ValueError):
        return None
    if x < 0 or y < 0 or x >= cw or y >= ch:
        return None
    asset_id = str(raw.get("assetId") or raw.get("id") or "").strip()
    path = str(raw.get("assetPath") or "").strip()
    if not asset_id and not path:
        return None
    try:
        yaw = float(raw.get("yaw") or 0)
    except (TypeError, ValueError):
        yaw = 0.0
    out = {"x": x, "y": y, "yaw": yaw}
    if asset_id:
        out["assetId"] = asset_id
    if path:
        out["assetPath"] = path
    return out


def _corner_props(n: int, asset_id: str = "col_egypt_01") -> list[dict[str, Any]]:
    n = max(2, int(n))
    coords = [(1, 1), (n - 2, 1), (1, n - 2), (n - 2, n - 2)]
    seen: set[tuple[int, int]] = set()
    out: list[dict[str, Any]] = []
    for x, y in coords:
        if (x, y) in seen or x < 0 or y < 0 or x >= n or y >= n:
            continue
        seen.add((x, y))
        out.append({"x": x, "y": y, "assetId": asset_id, "yaw": 0})
    return out


# ---------------------------------------------------------------------------
# Default chunks — prefabPath MUST match real Content/Prefabs/Chunks assets.
# Never invent EP_Chk_* names that are not under the project Content folder.
# ---------------------------------------------------------------------------

# Synthetic Tetris ids from older builds that pointed at missing Content prefabs.
LEGACY_FAKE_CHUNK_IDS: frozenset[str] = frozenset({
    "chk_tet_i", "chk_tet_i_tall", "chk_tet_o", "chk_tet_l", "chk_tet_j",
    "chk_tet_t", "chk_tet_s", "chk_tet_z",
    "chk_poly_l9", "chk_poly_t9", "chk_poly_u", "chk_objective_l",
})


def _rect_mask(w: int, h: int) -> list[str]:
    row = "#" * max(1, int(w))
    return [row for _ in range(max(1, int(h)))]


def _mid_doors(n: int, face: str, z: int = 0) -> list[tuple]:
    """Two door ports centered on an edge of an n×n rect (optional height_step)."""
    n = max(2, int(n))
    a, b = (n // 2) - 1, n // 2
    hz = int(z)
    if face == "N":
        ports = [(a, 0, "N"), (b, 0, "N")]
    elif face == "S":
        ports = [(a, n - 1, "S"), (b, n - 1, "S")]
    elif face == "E":
        ports = [(n - 1, a, "E"), (n - 1, b, "E")]
    else:
        ports = [(0, a, "W"), (0, b, "W")]
    if hz:
        return [(x, y, f, hz) for x, y, f in ports]
    return ports


def _mid_ledges(n: int, face: str, z: int = 1) -> list[tuple]:
    """Two ledge ports at height_step z — balcony / upper walkway connectors."""
    n = max(2, int(n))
    a, b = (n // 2) - 1, n // 2
    hz = max(0, int(z))
    if face == "N":
        return [(a, 0, "N", hz), (b, 0, "N", hz)]
    if face == "S":
        return [(a, n - 1, "S", hz), (b, n - 1, "S", hz)]
    if face == "E":
        return [(n - 1, a, "E", hz), (n - 1, b, "E", hz)]
    return [(0, a, "W", hz), (0, b, "W", hz)]


def _edge_kinds(n: int, kind: str, *, door_mid: bool = False) -> list[str]:
    n = max(1, int(n))
    if not door_mid or n < 2:
        return [kind] * n
    out = ["wall"] * n
    out[(n // 2) - 1] = kind
    out[n // 2] = kind
    return out


def _edge_hz(n: int, kind: str, z: int = 0, *, door_mid: bool = False) -> list:
    """Edge kinds with height_step (tuples) for balcony / stair sockets."""
    base = _edge_kinds(n, kind, door_mid=door_mid)
    hz = int(z)
    if not hz:
        return base
    return [(k, hz) if k != "wall" else "wall" for k in base]


def _build_default_chunks() -> list[dict[str, Any]]:
    # Prefab paths 1:1 with Content/Prefabs/Chunks/Egypt/EP_Egypt_*.uasset.
    # Built by scripts/build_egypt_chunk_prefabs.py (512uu grid, Socket/Slot markers).
    DD2 = ["door", "door"]
    WW2 = ["wall", "wall"]
    OO2 = ["open", "open"]
    P = "/Roguelike/Prefabs/Chunks/Egypt"
    def ep(sub: str, name: str) -> str:
        return f"{P}/{sub}/{name}"
    EG = ["egypt", "ruins"]
    EGV = ["egypt", "ruins", "vertical"]
    EGF = ["egypt", "fields"]
    r4 = _rect_mask(4, 4)
    r3 = _rect_mask(3, 3)
    boss8 = _rect_mask(8, 8)
    obj6 = _rect_mask(6, 6)
    o4 = "open"
    chunks: list[dict[str, Any]] = [
        _poly_chunk(
            "chk_entrance", "Egypt Entrance 4×4", r4, "entrance",
            doors=_mid_doors(4, "N"),
            slots=[{"group": "A", "x": 1, "y": 2}, {"group": "A", "x": 2, "y": 2}],
            shape="O4", tags=EG, prefab_path=ep("Entrances", "EP_Egypt_Entrance"), weight=1.2,
        ),
        _poly_chunk(
            "chk_exit", "Egypt Exit 4×4", r4, "exit",
            doors=_mid_doors(4, "S"),
            slots=[{"group": "A", "x": 1, "y": 1}, {"group": "A", "x": 2, "y": 1}],
            shape="O4", tags=EG, prefab_path=ep("Entrances", "EP_Egypt_Exit"), weight=1.2,
        ),
        _poly_chunk(
            "chk_objective", "Egypt Objective Arena 6×6", obj6, "objective",
            doors=_mid_doors(6, "N") + _mid_doors(6, "S"),
            slots=[
                {"group": "B", "x": 3, "y": 3},
                {"group": "A", "x": 2, "y": 1},
            ],
            props=_corner_props(6, "col_egypt_01"),
            shape="O6", tags=EG, weight=2.0, prefab_path=ep("Special", "EP_Egypt_Objective"),
        ),
        _poly_chunk(
            "chk_boss", "Egypt Boss Arena 8×8", boss8, "boss",
            doors=_mid_doors(8, "N") + _mid_doors(8, "S"),
            slots=[
                {"group": "B", "x": 3, "y": 3},
                {"group": "B", "x": 4, "y": 4},
            ],
            props=_corner_props(8, "col_egypt_02"),
            shape="O8", tags=EG, weight=1.6, prefab_path=ep("Special", "EP_Egypt_Boss"),
        ),
        _poly_chunk(
            "chk_room_ns", "Egypt Room N-S 4×4", r4, "room",
            doors=_mid_doors(4, "N") + _mid_doors(4, "S"),
            slots=[{"group": "A", "x": 1, "y": 1}, {"group": "A", "x": 2, "y": 2}],
            shape="O4", tags=EG, weight=1.6, prefab_path=ep("Rooms", "EP_Egypt_RoomNS"),
        ),
        _poly_chunk(
            "chk_room_cross", "Egypt Room Cross 4×4", r4, "room",
            doors=_mid_doors(4, "N") + _mid_doors(4, "E") + _mid_doors(4, "S") + _mid_doors(4, "W"),
            slots=[{"group": "A", "x": 1, "y": 1}, {"group": "A", "x": 2, "y": 2}],
            shape="O4", tags=EG, weight=1.4, prefab_path=ep("Rooms", "EP_Egypt_RoomCross"),
        ),
        _chunk(
            "chk_conn_straight", "Egypt Straight Hall 2×2", 2, 2, "connector",
            {"N": DD2, "E": WW2, "S": DD2, "W": WW2},
            tags=EG, weight=2.0, prefab_path=ep("Connectors", "EP_Egypt_ConnStraight"),
        ),
        _chunk(
            "chk_conn_l", "Egypt L Hall 2×2", 2, 2, "connector",
            {"N": DD2, "E": DD2, "S": WW2, "W": WW2},
            tags=EG, weight=1.8, prefab_path=ep("Connectors", "EP_Egypt_ConnL"),
        ),
        _chunk(
            "chk_conn_t", "Egypt T Junction 2×2", 2, 2, "connector",
            {"N": DD2, "E": DD2, "S": DD2, "W": WW2},
            tags=EG, weight=1.6, prefab_path=ep("Connectors", "EP_Egypt_ConnT"),
        ),
        _poly_chunk(
            "chk_deadend", "Egypt Dead End 3×3", r3, "deadend",
            doors=_mid_doors(3, "N"),
            slots=[{"group": "A", "x": 1, "y": 1}],
            shape="O3", tags=EG, weight=0.7, prefab_path=ep("Rooms", "EP_Egypt_Deadend"),
        ),
        _chunk(
            "chk_cap", "Egypt Cap", 1, 1, "cap",
            {"N": ["wall"], "E": ["wall"], "S": ["door"], "W": ["wall"]},
            tags=EG, rotations=[0, 90, 180, 270], weight=0.2, prefab_path=ep("Special", "EP_Egypt_Cap"),
        ),
        _chunk(
            "chk_filler", "Egypt Filler Wall", 1, 1, "filler",
            {"N": ["wall"], "E": ["wall"], "S": ["wall"], "W": ["wall"]},
            tags=EG, rotations=[0], weight=0.1, prefab_path=ep("Special", "EP_Egypt_Filler"),
        ),
        _chunk(
            "chk_outdoor_entrance", "Egypt Field Entrance 4×4", 4, 4, "entrance",
            {
                "N": _edge_kinds(4, o4, door_mid=True),
                "E": _edge_kinds(4, "wall"),
                "S": _edge_kinds(4, "wall"),
                "W": _edge_kinds(4, "wall"),
            },
            space="outside", roof=False, tags=EGF,
            prefab_path=ep("Outdoor", "EP_Egypt_OutdoorEntrance"),
        ),
        _chunk(
            "chk_outdoor_exit", "Egypt Field Exit 4×4", 4, 4, "exit",
            {
                "N": _edge_kinds(4, "wall"),
                "E": _edge_kinds(4, "wall"),
                "S": _edge_kinds(4, o4, door_mid=True),
                "W": _edge_kinds(4, "wall"),
            },
            space="outside", roof=False, tags=EGF,
            prefab_path=ep("Outdoor", "EP_Egypt_OutdoorExit"),
        ),
        _chunk(
            "chk_outdoor_room", "Egypt Outdoor Clearing 4×4", 4, 4, "room",
            {
                "N": _edge_kinds(4, o4, door_mid=True),
                "E": _edge_kinds(4, o4, door_mid=True),
                "S": _edge_kinds(4, o4, door_mid=True),
                "W": _edge_kinds(4, o4, door_mid=True),
            },
            space="outside", roof=False, tags=EGF,
            weight=1.5, prefab_path=ep("Outdoor", "EP_Egypt_OutdoorRoom"),
        ),
        _chunk(
            "chk_outdoor_conn", "Egypt Field Path 2×2", 2, 2, "connector",
            {"N": OO2, "E": WW2, "S": OO2, "W": WW2},
            space="outside", roof=False, tags=EGF,
            weight=2.0, prefab_path=ep("Outdoor", "EP_Egypt_OutdoorConn"),
        ),
        _poly_chunk(
            "chk_outdoor_objective", "Egypt Field Objective 6×6", obj6, "objective",
            doors=_mid_doors(6, "N") + _mid_doors(6, "S"),
            space="outside", roof=False, tags=EGF, shape="O6",
            prefab_path=ep("Outdoor", "EP_Egypt_OutdoorObjective"),
        ),
        _chunk(
            "chk_outdoor_deadend", "Egypt Field Cul-de-sac 3×3", 3, 3, "deadend",
            {
                "N": _edge_kinds(3, o4, door_mid=True),
                "E": _edge_kinds(3, "wall"),
                "S": _edge_kinds(3, "wall"),
                "W": _edge_kinds(3, "wall"),
            },
            space="outside", roof=False, tags=EGF,
            prefab_path=ep("Outdoor", "EP_Egypt_OutdoorDeadend"),
        ),
        _chunk(
            "chk_test_empty", "Egypt Test Empty 2×2", 2, 2, "room",
            {"N": DD2, "E": WW2, "S": DD2, "W": WW2},
            tags=EG, weight=0.05, prefab_path=ep("Special", "EP_Egypt_TestEmpty"),
        ),
        # --- Vertical / balcony catalogue (cz = stories) ---
        _chunk(
            "chk_balcony_2x2", "Egypt Balcony 2×2×1", 2, 2, "connector",
            {
                "N": [("ledge", 1), ("ledge", 1)],
                "E": WW2,
                "S": [("door", 1), ("door", 1)],
                "W": WW2,
            },
            cz=1, space="outside", roof=False, tags=EGV,
            weight=1.5, prefab_path=ep("Vertical", "EP_Egypt_Balcony2x2"),
        ),
        _chunk(
            "chk_balcony_4x2", "Egypt Balcony Walk 4×2×1", 4, 2, "connector",
            {
                "N": _edge_hz(4, "ledge", 1, door_mid=True),
                "E": [("ledge", 1), ("ledge", 1)],
                "S": _edge_hz(4, "door", 1, door_mid=True),
                "W": [("ledge", 1), ("ledge", 1)],
            },
            cz=1, space="outside", roof=False, tags=EGV,
            weight=1.3, prefab_path=ep("Vertical", "EP_Egypt_Balcony4x2"),
        ),
        _chunk(
            "chk_conn_stair_2x2x2", "Egypt Stair Rise 2×2×2", 2, 2, "connector",
            {"N": DD2, "E": WW2, "S": [("door", 1), ("door", 1)], "W": WW2},
            cz=2, tags=EGV, weight=1.8, prefab_path=ep("Vertical", "EP_Egypt_ConnStair2x2x2"),
        ),
        _chunk(
            "chk_conn_shaft_2x2x4", "Egypt Shaft Hall 2×2×4", 2, 2, "connector",
            {
                "N": DD2,
                "E": [("ledge", 2), ("ledge", 2)],
                "S": DD2,
                "W": [("ledge", 2), ("ledge", 2)],
            },
            cz=4, tags=EGV, weight=1.2, prefab_path=ep("Vertical", "EP_Egypt_ConnShaft2x2x4"),
        ),
        _chunk(
            "chk_conn_bridge_2x2", "Egypt Sky Bridge 2×2×1", 2, 2, "connector",
            {
                "N": [("ledge", 1), ("ledge", 1)],
                "E": WW2,
                "S": [("ledge", 1), ("ledge", 1)],
                "W": WW2,
            },
            cz=1, space="outside", roof=False, tags=EGV,
            weight=1.4, prefab_path=ep("Vertical", "EP_Egypt_ConnBridge2x2"),
        ),
        _poly_chunk(
            "chk_room_tall_4x4x2", "Egypt Tall Room 4×4×2", r4, "room",
            doors=_mid_doors(4, "N") + _mid_doors(4, "S"),
            ledges=_mid_ledges(4, "E", 1) + _mid_ledges(4, "W", 1),
            cz=2, shape="O4x2", tags=EGV, weight=1.4, prefab_path=ep("Vertical", "EP_Egypt_RoomTall4x4x2"),
        ),
        _poly_chunk(
            "chk_atrium_4x4x4", "Egypt Atrium 4×4×4", r4, "room",
            doors=_mid_doors(4, "N") + _mid_doors(4, "S"),
            ledges=_mid_ledges(4, "E", 2) + _mid_ledges(4, "W", 2),
            cz=4, shape="O4x4", tags=EGV, weight=1.1, prefab_path=ep("Vertical", "EP_Egypt_Atrium4x4x4"),
        ),
        _poly_chunk(
            "chk_entrance_tall", "Egypt Tall Entrance 4×4×2", r4, "entrance",
            doors=_mid_doors(4, "N"),
            ledges=_mid_ledges(4, "S", 1),
            cz=2, shape="O4x2", tags=EGV, weight=1.1, prefab_path=ep("Entrances", "EP_Egypt_EntranceTall"),
            slots=[{"group": "A", "x": 1, "y": 2}, {"group": "A", "x": 2, "y": 2}],
        ),
        _poly_chunk(
            "chk_exit_tall", "Egypt Tall Exit 4×4×2", r4, "exit",
            doors=_mid_doors(4, "S"),
            ledges=_mid_ledges(4, "N", 1),
            cz=2, shape="O4x2", tags=EGV, weight=1.1, prefab_path=ep("Entrances", "EP_Egypt_ExitTall"),
            slots=[{"group": "A", "x": 1, "y": 1}, {"group": "A", "x": 2, "y": 1}],
        ),
        _chunk(
            "chk_entrance_2x2", "Egypt Entrance 2×2×1", 2, 2, "entrance",
            {"N": DD2, "E": WW2, "S": DD2, "W": WW2},
            cz=1, tags=EG, weight=1.0, prefab_path=ep("Entrances", "EP_Egypt_Entrance2x2"),
        ),
        _chunk(
            "chk_exit_2x2", "Egypt Exit 2×2×1", 2, 2, "exit",
            {"N": DD2, "E": WW2, "S": DD2, "W": WW2},
            cz=1, tags=EG, weight=1.0, prefab_path=ep("Entrances", "EP_Egypt_Exit2x2"),
        ),
        _chunk(
            "chk_conn_cross_ledge", "Egypt Cross + Ledges 2×2×2", 2, 2, "connector",
            {
                "N": DD2,
                "E": [("ledge", 1), ("ledge", 1)],
                "S": DD2,
                "W": [("ledge", 1), ("ledge", 1)],
            },
            cz=2, tags=EGV, weight=1.5, prefab_path=ep("Vertical", "EP_Egypt_ConnCrossLedge"),
        ),
    ]
    cleaned: list[dict[str, Any]] = []
    seen: set[str] = set()
    for c in chunks:
        if not isinstance(c, dict):
            continue
        cid = c.get("id")
        if not cid or cid in seen:
            continue
        seen.add(str(cid))
        tags = list(c.get("tags") or [])
        if "egypt" not in tags:
            tags = ["egypt"] + tags
        c["tags"] = tags
        cleaned.append(c)
    return [normalize_chunk(c) for c in cleaned]


DEFAULT_CHUNKS: list[dict[str, Any]] = _build_default_chunks()

DEFAULT_GEN_TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "gen_linear_gauntlet",
        "name": "Linear Gauntlet",
        "space": "inside",
        "seed": 1337,
        "spine": [
            "entrance", "connector", "room", "connector", "room",
            "connector", "objective", "connector", "room", "exit",
        ],
        "openSocketScope": "last",
        "branchBudget": 0,
        "branchDepthMax": 0,
        "tags": ["ruins"],
        "maxAttempts": 40,
        "metrics": {"mainPathLen": [6, 40]},
    },
    {
        "id": "gen_crypt",
        "name": "Crypt",
        "space": "inside",
        "seed": 42,
        "spine": [
            "entrance", "connector", "room", "connector",
            "objective", "connector", "room", "exit",
        ],
        "openSocketScope": "all",
        "branchBudget": 3,
        "branchDepthMax": 2,
        "tags": ["ruins"],
        "maxAttempts": 40,
        "metrics": {"mainPathLen": [5, 30]},
    },
    {
        "id": "gen_open_fields",
        "name": "Open Fields",
        "space": "outside",
        "seed": 99,
        "spine": ["entrance", "room", "room", "objective", "room", "exit"],
        "openSocketScope": "all",
        "branchBudget": 4,
        "branchDepthMax": 2,
        "tags": ["fields"],
        "maxAttempts": 40,
        "metrics": {"mainPathLen": [4, 25]},
    },
    {
        "id": "gen_boss_run",
        "name": "Boss Run",
        "space": "inside",
        "seed": 7,
        "spine": ["entrance", "connector", "room", "connector", "objective", "exit"],
        "openSocketScope": "last",
        "branchBudget": 1,
        "branchDepthMax": 1,
        "tags": ["ruins"],
        "maxAttempts": 40,
        "metrics": {"mainPathLen": [4, 16]},
    },
    {
        "id": "gen_egypt_crypt",
        "name": "Egypt Crypt",
        "space": "inside",
        "seed": 2600,
        "spine": [
            "entrance", "connector", "room", "connector",
            "objective", "connector", "room", "exit",
        ],
        "openSocketScope": "all",
        "branchBudget": 3,
        "branchDepthMax": 2,
        "tags": ["egypt"],
        "mapHeight": 2,
        "maxAttempts": 40,
        "metrics": {"mainPathLen": [5, 30]},
    },
    {
        "id": "gen_egypt_gauntlet",
        "name": "Egypt Gauntlet",
        "space": "inside",
        "seed": 1337,
        "spine": [
            "entrance", "connector", "room", "connector", "room",
            "connector", "objective", "connector", "room", "exit",
        ],
        "openSocketScope": "last",
        "branchBudget": 0,
        "branchDepthMax": 0,
        "tags": ["egypt"],
        "mapHeight": 1,
        "maxAttempts": 40,
        "metrics": {"mainPathLen": [6, 40]},
    },
]


def normalize_template(raw: dict[str, Any]) -> dict[str, Any]:
    t = deepcopy(raw) if isinstance(raw, dict) else {}
    t.setdefault("id", "gen_unnamed")
    t.setdefault("name", t["id"])
    t.setdefault("space", "inside")
    t.setdefault("seed", 0)
    t.setdefault("spine", ["entrance", "room", "exit"])
    t.setdefault("openSocketScope", "last")
    t.setdefault("branchBudget", 0)
    t.setdefault("branchDepthMax", 1)
    t.setdefault("tags", [])
    t.setdefault("maxAttempts", 25)
    t.setdefault("metrics", {"mainPathLen": [3, 40]})
    # Size / sprawl knobs (UI): pad main path, optional filler packing
    try:
        t["sizeScale"] = max(1, min(5, int(t.get("sizeScale") if t.get("sizeScale") is not None else 2)))
    except (TypeError, ValueError):
        t["sizeScale"] = 2
    try:
        t["pathPadding"] = max(0, min(12, int(t.get("pathPadding") if t.get("pathPadding") is not None else 0)))
    except (TypeError, ValueError):
        t["pathPadding"] = 0
    try:
        t["straightness"] = max(0, min(100, int(t.get("straightness") if t.get("straightness") is not None else 50)))
    except (TypeError, ValueError):
        t["straightness"] = 50
    # Map height in stories — caps chunk cz / elevated sockets (1 = flat only).
    try:
        mh = t.get("mapHeight")
        if mh is None:
            mh = t.get("maxStories")
        t["mapHeight"] = max(1, min(8, int(mh if mh is not None else 1)))
    except (TypeError, ValueError):
        t["mapHeight"] = 1
    # Default: surround indoor maps with filler walls; open/outside keep air gaps
    if "fillEmpty" not in t:
        open_sprawl = str(t.get("openSocketScope") or "last") == "all" and int(t.get("branchBudget") or 0) >= 6
        t["fillEmpty"] = (str(t.get("space") or "inside") == "inside") and not open_sprawl
    else:
        t["fillEmpty"] = bool(t.get("fillEmpty"))
    # Verse placeable that owns LevelType / Seed / Space / Chunks[]
    t.setdefault("verseClass", "roguelike_generation_device")
    return t
