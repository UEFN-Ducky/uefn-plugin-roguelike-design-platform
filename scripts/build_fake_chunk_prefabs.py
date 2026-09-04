"""UEFN editor one-shot: fake 512uu chunk EntityPrefabs for RGD procgen smoke tests.

Run via listener execute_python (imports listener.registry.scene_graph helpers).

Creates /Roguelike/Prefabs/Chunks/EP_Chk_* with:
  - floor plates snapped to WORLD_STEP=512
  - wall stubs on wall sockets
  - Socket_<DIR><I>_<Door|Open|Wall> marker children

Uses VNI-ready project meshes (SM_Floor_2 / SM_Crystal7) until a Verse build
registers SM_TileFloor512 / SM_TileWall (already authored under /Roguelike/Meshes).
"""

from __future__ import annotations

WORLD = 512.0
FOLDER = "/Roguelike/Prefabs/Chunks"
# VNI-ready meshes (digest+runtime). TileFloor512 needs Verse build before swap.
FLOOR_MESH = "/Roguelike/MagicianLabatory/Source/Building/Floor1F/Floor1F2/SM_Floor_2.SM_Floor_2"
WALL_MESH = "/Roguelike/MagicianLabatory/BP/Crystal/StaticMesh/SM_Crystal7.SM_Crystal7"
# SM_Floor_2 box_extent ~331.88 x 320.42 → full ~663.77 x 640.83
FLOOR_SX = WORLD / 663.768
FLOOR_SY = WORLD / 640.834
# Crystal extents ~535.6 x 485.9 x 1061.9 — scale toward 512 x 64 x 256 wall stub
WALL_SX = WORLD / 535.61
WALL_SY = 64.0 / 485.94
WALL_SZ = 256.0 / 1061.86

# Edge socket lists length must match edge cells (cw for N/S, ch for E/W).
def _mid(n: int, kind: str) -> list[str]:
    out = ["wall"] * n
    if n >= 2:
        out[(n // 2) - 1] = kind
        out[n // 2] = kind
    elif n == 1:
        out[0] = kind
    return out


_DW8, _DO8 = ["wall"] * 8, _mid(8, "door")
_DW6, _DO6, _OO6 = ["wall"] * 6, _mid(6, "door"), _mid(6, "open")
_DW4, _DO4, _OO4 = ["wall"] * 4, _mid(4, "door"), _mid(4, "open")
_DW3, _DO3, _OO3 = ["wall"] * 3, _mid(3, "door"), _mid(3, "open")

CHUNKS = [
    ("EP_Chk_Entrance", 4, 4, {"N": _DO4, "E": _DW4, "S": _DW4, "W": _DW4}),
    ("EP_Chk_Exit", 4, 4, {"N": _DW4, "E": _DW4, "S": _DO4, "W": _DW4}),
    ("EP_Chk_Objective", 6, 6, {"N": _DO6, "E": _DW6, "S": _DO6, "W": _DW6}),
    ("EP_Chk_Boss", 8, 8, {"N": _DO8, "E": _DW8, "S": _DO8, "W": _DW8}),
    ("EP_Chk_RoomNS", 4, 4, {"N": _DO4, "E": _DW4, "S": _DO4, "W": _DW4}),
    ("EP_Chk_RoomCross", 4, 4, {"N": _DO4, "E": _DO4, "S": _DO4, "W": _DO4}),
    ("EP_Chk_ConnStraight", 2, 2, {"N": ["door", "door"], "E": ["wall", "wall"], "S": ["door", "door"], "W": ["wall", "wall"]}),
    ("EP_Chk_ConnL", 2, 2, {"N": ["door", "door"], "E": ["door", "door"], "S": ["wall", "wall"], "W": ["wall", "wall"]}),
    ("EP_Chk_ConnT", 2, 2, {"N": ["door", "door"], "E": ["door", "door"], "S": ["door", "door"], "W": ["wall", "wall"]}),
    ("EP_Chk_Deadend", 3, 3, {"N": _DO3, "E": _DW3, "S": _DW3, "W": _DW3}),
    ("EP_Chk_Cap", 1, 1, {"N": ["wall"], "E": ["wall"], "S": ["door"], "W": ["wall"]}),
    ("EP_Chk_Filler", 1, 1, {"N": ["wall"], "E": ["wall"], "S": ["wall"], "W": ["wall"]}),
    ("EP_Chk_OutdoorEntrance", 4, 4, {"N": _OO4, "E": _DW4, "S": _DW4, "W": _DW4}),
    ("EP_Chk_OutdoorExit", 4, 4, {"N": _DW4, "E": _DW4, "S": _OO4, "W": _DW4}),
    ("EP_Chk_OutdoorRoom", 4, 4, {"N": _OO4, "E": _OO4, "S": _OO4, "W": _OO4}),
    ("EP_Chk_OutdoorConn", 2, 2, {"N": ["open", "open"], "E": ["wall", "wall"], "S": ["open", "open"], "W": ["wall", "wall"]}),
    ("EP_Chk_OutdoorObjective", 6, 6, {"N": _OO6, "E": _DW6, "S": _OO6, "W": _DW6}),
    ("EP_Chk_OutdoorDeadend", 3, 3, {"N": _OO3, "E": _DW3, "S": _DW3, "W": _DW3}),
    ("EP_Chk_TestEmpty", 2, 2, {"N": ["door", "door"], "E": ["wall", "wall"], "S": ["door", "door"], "W": ["wall", "wall"]}),
]


def _kind_label(kind: str) -> str:
    k = kind.lower()
    if k == "door":
        return "Door"
    if k in ("open", "ledge", "window"):
        return "Open"
    return "Wall"


def _sock_pos(face: str, idx: int, cw: int, ch: int) -> tuple[float, float, float]:
    half = WORLD * 0.5
    if face == "N":
        return (idx * WORLD, (ch - 1) * WORLD + half, 128.0)
    if face == "S":
        return (idx * WORLD, -half, 128.0)
    if face == "E":
        return ((cw - 1) * WORLD + half, idx * WORLD, 128.0)
    return (-half, idx * WORLD, 128.0)


def _safe_destroy(sg, name: str) -> None:
    try:
        sg.destroy_entity(name)
    except Exception:
        pass


def build_one(sg, pname: str, cw: int, ch: int, socks: dict, index: int) -> dict:
    import unreal

    root = f"RGD_BUILD_{pname}"
    _safe_destroy(sg, root)
    # wipe leftover children names from prior runs
    for iy in range(ch):
        for ix in range(cw):
            _safe_destroy(sg, f"{root}_F{ix}_{iy}")
    for face, kinds in socks.items():
        for idx, kind in enumerate(kinds):
            _safe_destroy(sg, f"{root}_W{face}{idx}")
            _safe_destroy(sg, f"Socket_{face}{idx}_{_kind_label(kind)}")
            _safe_destroy(sg, f"{root}_Socket_{face}{idx}_{_kind_label(kind)}")

    ox = -400000.0 + index * 12000.0
    oy = -400000.0
    sg.create_entity(root, translation=[ox, oy, 0.0])

    names = [root]
    for iy in range(ch):
        for ix in range(cw):
            fname = f"{root}_F{ix}_{iy}"
            sg.create_entity(
                fname,
                parent_entity=root,
                translation=[ix * WORLD, iy * WORLD, 0.0],
                scale=[FLOOR_SX, FLOOR_SY, 1.0],
            )
            sg.add_entity_component(fname, "mesh_component", FLOOR_MESH)
            names.append(fname)

    for face, kinds in socks.items():
        for idx, kind in enumerate(kinds):
            if kind.lower() not in ("wall", "void"):
                continue
            wname = f"{root}_W{face}{idx}"
            px, py, pz = _sock_pos(face, idx, cw, ch)
            if face in ("N", "S"):
                sx, sy, sz = WALL_SX, WALL_SY, WALL_SZ
            else:
                sx, sy, sz = WALL_SY, WALL_SX, WALL_SZ
            sg.create_entity(
                wname,
                parent_entity=root,
                translation=[px, py, 128.0],
                scale=[sx, sy, sz],
            )
            sg.add_entity_component(wname, "mesh_component", WALL_MESH)
            names.append(wname)

    for face, kinds in socks.items():
        for idx, kind in enumerate(kinds):
            sname = f"Socket_{face}{idx}_{_kind_label(kind)}"
            # unique temp name then rename
            uname = f"{root}_{sname}"
            px, py, pz = _sock_pos(face, idx, cw, ch)
            sg.create_entity(
                uname,
                parent_entity=root,
                translation=[px, py, pz],
                scale=[0.15, 0.15, 0.15],
            )
            try:
                sg.rename_entity(uname, sname)
                names.append(sname)
            except Exception:
                names.append(uname)

    if not unreal.EditorAssetLibrary.does_directory_exist(FOLDER):
        unreal.EditorAssetLibrary.make_directory(FOLDER)
    # Replace stale/empty prefab assets so packaging can succeed
    asset = f"{FOLDER}/{pname}"
    if unreal.EditorAssetLibrary.does_asset_exist(asset):
        unreal.EditorAssetLibrary.delete_asset(asset)
    # Package root only — children come along via hierarchy
    prefab = sg.create_prefab_from_entities([root], pname, FOLDER)
    return {"name": pname, "prefab": asset, "result": str(prefab)}


def build_all(start: int = 0, count: int = 1) -> dict:
    """Build a slice of chunks (default one) — safer for UEFN stability."""
    from listener.registry import scene_graph as sg

    created = []
    errors = []
    slice_ = CHUNKS[start : start + count]
    for i, (pname, cw, ch, socks) in enumerate(slice_):
        try:
            created.append(build_one(sg, pname, cw, ch, socks, start + i))
        except Exception as e:
            import traceback

            errors.append({"name": pname, "error": repr(e), "tb": traceback.format_exc()[-800:]})
            break
    try:
        import unreal

        unreal.EditorLoadingAndSavingUtils.save_dirty_packages(False, True)
    except Exception:
        pass
    return {
        "world_step": WORLD,
        "created": created,
        "errors": errors,
        "next_start": start + len(created),
        "remaining": max(0, len(CHUNKS) - (start + len(created))),
    }


# Listener execute_python entry: set START/COUNT then assign result=
START = 0
COUNT = 1
try:
    result = build_all(START, COUNT)
except Exception as e:
    import traceback

    result = {"error": repr(e), "tb": traceback.format_exc()[-1200:]}
