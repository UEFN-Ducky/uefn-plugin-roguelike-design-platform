"""UEFN editor: production Egypt chunk EntityPrefabs for RGD Level Gen.

UEFN's create_prefab_from_entities ZEROS child local transforms — so we cannot
bake a hierarchy of floor/wall entities. Instead:

  1. Spawn StaticMeshActors (floors/walls/doors/roof) at correct offsets
  2. Merge → one SM_Egypt_* under /Roguelike/Meshes/Chunks/Egypt/
  3. Package a single-mesh EntityPrefab (root + one mesh child at 0,0,0)
  4. Destroy ALL temp actors/entities — never leave junk in the level

Grid contract: WORLD_STEP = 512 uu per cell (not literal \"5\"; one cell is a
512×512 floor with 512-tall walls — a real cube room).
"""

from __future__ import annotations

import math

WORLD = 512.0
ROOT_FOLDER = "/Roguelike/Prefabs/Chunks/Egypt"
MESH_FOLDER = "/Roguelike/Meshes/Chunks/Egypt"

FLOOR_MESH = "/Roguelike/Stylized_Egypt/Meshes/building/SM_floor_01"
WALL_MESH = "/Roguelike/Stylized_Egypt/Meshes/building/SM_wall_01"
DOOR_MESH = "/Roguelike/Stylized_Egypt/Meshes/building/SM_door_02"
STAIR_MESH = "/Roguelike/Stylized_Egypt/Meshes/building/SM_stairs_01"
COLUMN_MESH = "/Roguelike/Stylized_Egypt/Meshes/building/SM_building_column_01"
GRID_FLOOR = "/Roguelike/Meshes/SM_TileFloor512"

# Measured kit bounds (pivot ≠ center):
#   SM_floor_01  AABB X[0,400] Y[-400,0] Z[-5,5]     — corner pivot
#   SM_wall_01   AABB X[0,800] Y[~±20]   Z[0,400]    — base corner, tall +Z
#   SM_door_02   ~centered XY, Z[~0,278]
#   SM_TileFloor512 centered 512²×32
# Cell (ix,iy) covers [ix*W,(ix+1)*W] × [iy*W,(iy+1)*W].
FLOOR_S = (WORLD / 400.0, WORLD / 400.0, 1.0)
WALL_S = (WORLD / 800.0, 1.0, WORLD / 400.0)  # 512 wide × ~40 thick × 512 tall
DOOR_S = (WORLD / 220.13, 1.0, (WORLD * 0.85) / 277.96)
STAIR_S = (WORLD / 400.25, WORLD / 331.93, WORLD / 230.34)
COL_S = (0.55, 0.55, 0.55)


def _mid(n: int, kind: str, hz: int = 0) -> list:
    out = [("wall", 0)] * n
    out = list(out)
    if n >= 2:
        out[(n // 2) - 1] = (kind, hz)
        out[n // 2] = (kind, hz)
    elif n == 1:
        out[0] = (kind, hz)
    return out


def _all(n: int, kind: str, hz: int = 0) -> list:
    return [(kind, hz)] * n


def _walls(n: int) -> list:
    return _all(n, "wall", 0)


DD2 = [("door", 0), ("door", 0)]
WW2 = [("wall", 0), ("wall", 0)]
OO2 = [("open", 0), ("open", 0)]
LD2 = [("ledge", 1), ("ledge", 1)]
D1_2 = [("door", 1), ("door", 1)]
LD2_2 = [("ledge", 2), ("ledge", 2)]

# (prefab_name, subfolder, cw, ch, cz, socks, slots, flags)
CHUNKS = [
    ("EP_Egypt_Entrance", "Entrances", 4, 4, 1, {"N": _mid(4, "door"), "E": _walls(4), "S": _walls(4), "W": _walls(4)},
     [{"g": "A", "x": 1, "y": 2}, {"g": "A", "x": 2, "y": 2}], {"roof": True}),
    ("EP_Egypt_Exit", "Entrances", 4, 4, 1, {"N": _walls(4), "E": _walls(4), "S": _mid(4, "door"), "W": _walls(4)},
     [{"g": "A", "x": 1, "y": 1}, {"g": "A", "x": 2, "y": 1}], {"roof": True}),
    ("EP_Egypt_Entrance2x2", "Entrances", 2, 2, 1, {"N": DD2, "E": WW2, "S": DD2, "W": WW2},
     [{"g": "A", "x": 0, "y": 1}], {"roof": True}),
    ("EP_Egypt_Exit2x2", "Entrances", 2, 2, 1, {"N": DD2, "E": WW2, "S": DD2, "W": WW2},
     [{"g": "A", "x": 0, "y": 0}], {"roof": True}),
    ("EP_Egypt_EntranceTall", "Entrances", 4, 4, 2, {"N": _mid(4, "door"), "E": _walls(4), "S": _mid(4, "ledge", 1), "W": _walls(4)},
     [{"g": "A", "x": 1, "y": 2}, {"g": "A", "x": 2, "y": 2}], {"roof": True}),
    ("EP_Egypt_ExitTall", "Entrances", 4, 4, 2, {"N": _mid(4, "ledge", 1), "E": _walls(4), "S": _mid(4, "door"), "W": _walls(4)},
     [{"g": "A", "x": 1, "y": 1}, {"g": "A", "x": 2, "y": 1}], {"roof": True}),
    ("EP_Egypt_Objective", "Special", 6, 6, 1, {"N": _mid(6, "door"), "E": _walls(6), "S": _mid(6, "door"), "W": _walls(6)},
     [{"g": "B", "x": 3, "y": 3}, {"g": "A", "x": 2, "y": 1}], {"roof": True, "columns": True}),
    ("EP_Egypt_Boss", "Special", 8, 8, 1, {"N": _mid(8, "door"), "E": _walls(8), "S": _mid(8, "door"), "W": _walls(8)},
     [{"g": "B", "x": 3, "y": 3}, {"g": "B", "x": 4, "y": 4}], {"roof": True, "columns": True}),
    ("EP_Egypt_RoomNS", "Rooms", 4, 4, 1, {"N": _mid(4, "door"), "E": _walls(4), "S": _mid(4, "door"), "W": _walls(4)},
     [{"g": "A", "x": 1, "y": 1}, {"g": "A", "x": 2, "y": 2}], {"roof": True}),
    ("EP_Egypt_RoomCross", "Rooms", 4, 4, 1, {"N": _mid(4, "door"), "E": _mid(4, "door"), "S": _mid(4, "door"), "W": _mid(4, "door")},
     [{"g": "A", "x": 1, "y": 1}, {"g": "A", "x": 2, "y": 2}], {"roof": True}),
    ("EP_Egypt_RoomTall4x4x2", "Vertical", 4, 4, 2, {"N": _mid(4, "door"), "E": _mid(4, "ledge", 1), "S": _mid(4, "door"), "W": _mid(4, "ledge", 1)},
     [{"g": "A", "x": 1, "y": 1}, {"g": "A", "x": 2, "y": 2}], {"roof": True}),
    ("EP_Egypt_Atrium4x4x4", "Vertical", 4, 4, 4, {"N": _mid(4, "door"), "E": _mid(4, "ledge", 2), "S": _mid(4, "door"), "W": _mid(4, "ledge", 2)},
     [{"g": "A", "x": 1, "y": 1}], {"roof": True, "atrium": True}),
    ("EP_Egypt_ConnStraight", "Connectors", 2, 2, 1, {"N": DD2, "E": WW2, "S": DD2, "W": WW2}, [], {"roof": True}),
    ("EP_Egypt_ConnL", "Connectors", 2, 2, 1, {"N": DD2, "E": DD2, "S": WW2, "W": WW2}, [], {"roof": True}),
    ("EP_Egypt_ConnT", "Connectors", 2, 2, 1, {"N": DD2, "E": DD2, "S": DD2, "W": WW2}, [], {"roof": True}),
    ("EP_Egypt_ConnStair2x2x2", "Vertical", 2, 2, 2, {"N": DD2, "E": WW2, "S": D1_2, "W": WW2},
     [], {"roof": True, "stair": True}),
    ("EP_Egypt_ConnShaft2x2x4", "Vertical", 2, 2, 4, {"N": DD2, "E": LD2_2, "S": DD2, "W": LD2_2}, [], {"roof": True}),
    ("EP_Egypt_ConnBridge2x2", "Vertical", 2, 2, 1, {"N": LD2, "E": WW2, "S": LD2, "W": WW2},
     [], {"roof": False, "balcony": True}),
    ("EP_Egypt_ConnCrossLedge", "Vertical", 2, 2, 2, {"N": DD2, "E": LD2, "S": DD2, "W": LD2}, [], {"roof": True}),
    ("EP_Egypt_Deadend", "Rooms", 3, 3, 1, {"N": _mid(3, "door"), "E": _walls(3), "S": _walls(3), "W": _walls(3)},
     [{"g": "A", "x": 1, "y": 1}], {"roof": True}),
    ("EP_Egypt_Cap", "Special", 1, 1, 1, {"N": [("wall", 0)], "E": [("wall", 0)], "S": [("door", 0)], "W": [("wall", 0)]},
     [], {"roof": True}),
    ("EP_Egypt_Filler", "Special", 1, 1, 1, {"N": [("wall", 0)], "E": [("wall", 0)], "S": [("wall", 0)], "W": [("wall", 0)]},
     [], {"roof": True}),
    ("EP_Egypt_TestEmpty", "Special", 2, 2, 1, {"N": DD2, "E": WW2, "S": DD2, "W": WW2}, [], {"roof": True}),
    ("EP_Egypt_OutdoorEntrance", "Outdoor", 4, 4, 1, {"N": _mid(4, "open"), "E": _walls(4), "S": _walls(4), "W": _walls(4)},
     [], {"roof": False}),
    ("EP_Egypt_OutdoorExit", "Outdoor", 4, 4, 1, {"N": _walls(4), "E": _walls(4), "S": _mid(4, "open"), "W": _walls(4)},
     [], {"roof": False}),
    ("EP_Egypt_OutdoorRoom", "Outdoor", 4, 4, 1, {"N": _mid(4, "open"), "E": _mid(4, "open"), "S": _mid(4, "open"), "W": _mid(4, "open")},
     [], {"roof": False}),
    ("EP_Egypt_OutdoorConn", "Outdoor", 2, 2, 1, {"N": OO2, "E": WW2, "S": OO2, "W": WW2}, [], {"roof": False}),
    ("EP_Egypt_OutdoorObjective", "Outdoor", 6, 6, 1, {"N": _mid(6, "open"), "E": _walls(6), "S": _mid(6, "open"), "W": _walls(6)},
     [{"g": "B", "x": 3, "y": 3}], {"roof": False}),
    ("EP_Egypt_OutdoorDeadend", "Outdoor", 3, 3, 1, {"N": _mid(3, "open"), "E": _walls(3), "S": _walls(3), "W": _walls(3)},
     [], {"roof": False}),
    ("EP_Egypt_Balcony2x2", "Vertical", 2, 2, 1, {"N": LD2, "E": WW2, "S": D1_2, "W": WW2},
     [], {"roof": False, "balcony": True}),
    ("EP_Egypt_Balcony4x2", "Vertical", 4, 2, 1, {"N": _mid(4, "ledge", 1), "E": LD2, "S": _mid(4, "door", 1), "W": LD2},
     [], {"roof": False, "balcony": True}),
]


def _parse_sock(entry) -> tuple[str, int]:
    if isinstance(entry, (list, tuple)):
        return str(entry[0]).lower(), int(entry[1] if len(entry) > 1 else 0)
    if isinstance(entry, dict):
        return str(entry.get("kind") or "wall").lower(), int(entry.get("height_step") or entry.get("z") or 0)
    return str(entry).lower(), 0


def _cell_floor_egypt(ix: int, iy: int, z: float) -> tuple[float, float, float]:
    """Egypt floor corner-pivot → cover cell AABB [ix,iy]."""
    return (ix * WORLD, (iy + 1) * WORLD, z)


def _cell_floor_grid(ix: int, iy: int, z: float) -> tuple[float, float, float]:
    """Centered SM_TileFloor512 → cell center."""
    return ((ix + 0.5) * WORLD, (iy + 0.5) * WORLD, z)


def _wall_base(face: str, idx: int, cw: int, ch: int, story: int = 0) -> tuple[float, float, float]:
    """Wall corner-pivot (X 0→W along edge, Z 0→W up). Sit on outer cell edges."""
    z = story * WORLD
    if face == "N":
        return (idx * WORLD, ch * WORLD, z)
    if face == "S":
        return (idx * WORLD, 0.0, z)
    if face == "E":
        return (cw * WORLD, idx * WORLD, z)
    return (0.0, idx * WORLD, z)


def _door_base(face: str, idx: int, cw: int, ch: int, story: int = 0) -> tuple[float, float, float]:
    """Door ~centered on pivot — put at mid-edge of the cell."""
    z = story * WORLD
    mid = (idx + 0.5) * WORLD
    if face == "N":
        return (mid, ch * WORLD, z)
    if face == "S":
        return (mid, 0.0, z)
    if face == "E":
        return (cw * WORLD, mid, z)
    return (0.0, mid, z)


def _face_yaw(face: str) -> float:
    return 90.0 if face in ("E", "W") else 0.0


# Legacy name used nowhere critical — keep for any external callers.
def _sock_pos(face: str, idx: int, cw: int, ch: int, hz: int = 0) -> tuple[float, float, float]:
    return _wall_base(face, idx, cw, ch, hz)


def _safe_destroy_entity(sg, name: str) -> None:
    try:
        sg.destroy_entity(name)
    except Exception:
        pass


def _wipe_level_junk(sg) -> int:
    """Destroy any leftover bake/verify entities under LevelEntity."""
    n = 0
    try:
        kids = list((sg.get_entity_info("LevelEntity") or {}).get("children") or [])
    except Exception:
        return 0
    keep = {"EP_Crystal", "TutorialPistolPickup"}
    for c in kids:
        if c in keep:
            continue
        if any(
            str(c).startswith(p)
            for p in ("RGD_EG_", "Chunk_", "VERIFY_", "Group_entity", "REINST_", "XF_", "XT_", "GX_", "FX_", "Sib")
        ) or str(c).startswith("EP_Egypt"):
            _safe_destroy_entity(sg, c)
            n += 1
    return n


def _spawn_sm(eas, mesh_path: str, loc, scale, yaw_deg: float, label: str):
    import unreal

    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    if mesh is None:
        raise RuntimeError(f"missing mesh {mesh_path}")
    actor = eas.spawn_actor_from_class(
        unreal.StaticMeshActor,
        unreal.Vector(float(loc[0]), float(loc[1]), float(loc[2])),
    )
    actor.set_actor_label(label)
    comp = actor.static_mesh_component
    comp.set_static_mesh(mesh)
    # UEFN Python: positional Rotator(0,90,0) is NOT yaw — use keywords only.
    xf = unreal.Transform(
        unreal.Vector(float(loc[0]), float(loc[1]), float(loc[2])),
        unreal.Rotator(pitch=0.0, yaw=float(yaw_deg), roll=0.0),
        unreal.Vector(float(scale[0]), float(scale[1]), float(scale[2])),
    )
    actor.set_actor_transform(xf, False, False)
    return actor


def _merge_actors_keep(actors, package_path: str, label: str):
    """Merge pieces into one SM_ asset and return the merged StaticMeshActor (still in level)."""
    import unreal

    if not actors:
        raise RuntimeError("nothing to merge")
    folder = "/".join(package_path.rstrip("/").split("/")[:-1])
    if not unreal.EditorAssetLibrary.does_directory_exist(folder):
        unreal.EditorAssetLibrary.make_directory(folder)
    # Engine auto-prefixes SM_ onto the leaf name — pass Egypt_Foo not SM_Egypt_Foo
    if unreal.EditorAssetLibrary.does_asset_exist(package_path):
        unreal.EditorAssetLibrary.delete_asset(package_path)
    # Also delete SM_ variant if prior probe left it
    sm_variant = package_path.replace("/Egypt_", "/SM_Egypt_")
    if sm_variant != package_path and unreal.EditorAssetLibrary.does_asset_exist(sm_variant):
        unreal.EditorAssetLibrary.delete_asset(sm_variant)
    opts = unreal.MergeStaticMeshActorsOptions()
    opts.set_editor_property("base_package_name", package_path)
    opts.set_editor_property("new_actor_label", label)
    opts.set_editor_property("spawn_merged_actor", True)
    opts.set_editor_property("destroy_source_actors", True)
    merged = unreal.EditorLevelLibrary.merge_static_mesh_actors(actors, opts)
    if not merged:
        raise RuntimeError(f"merge failed for {package_path}")
    comp = merged.get_component_by_class(unreal.StaticMeshComponent)
    sm = comp.static_mesh if comp else None
    if sm is None:
        raise RuntimeError(f"merge produced no static mesh for {package_path}")
    return merged, sm.get_path_name().split(".")[0]


def build_mesh_only(pname: str, cw: int, ch: int, cz: int, socks: dict, slots: list, flags: dict, index: int) -> dict:
    """Spawn pieces → merge SM → destroy actors. Prefab packaging needs a Verse build after this."""
    import unreal

    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    # Far off-world authoring pad (Unreal XYZ for actors)
    ox = -600000.0 + (index % 6) * 25000.0
    oy = -600000.0 - (index // 6) * 25000.0
    oz = 0.0

    atrium = bool(flags.get("atrium"))
    balcony = bool(flags.get("balcony"))
    roof = bool(flags.get("roof", True))
    stories = max(1, int(cz))
    actors = []
    i = 0

    def add(mesh, loc, scale, yaw=0.0, tag="p"):
        nonlocal i
        i += 1
        a = _spawn_sm(
            eas,
            mesh,
            (ox + loc[0], oy + loc[1], oz + loc[2]),
            scale,
            yaw,
            f"RGD_TMP_{pname}_{tag}{i}",
        )
        actors.append(a)
        return a

    floor_stories = [0] if atrium or balcony else list(range(stories))
    if balcony:
        floor_stories = [1]

    # Merge pivot = first actor. Anchor at room origin so SM local (0,0,0) = cell (0,0) corner.
    add(GRID_FLOOR, (0.0, 0.0, -64.0), (0.02, 0.02, 0.02), tag="anchor")

    for story in floor_stories:
        z = story * WORLD
        for iy in range(ch):
            for ix in range(cw):
                add(GRID_FLOOR, _cell_floor_grid(ix, iy, z), (1.0, 1.0, 1.0), tag="gf")
                add(FLOOR_MESH, _cell_floor_egypt(ix, iy, z + 6.0), FLOOR_S, tag="ef")

    for face, kinds in socks.items():
        for idx, entry in enumerate(kinds):
            kind, hz = _parse_sock(entry)
            yaw = _face_yaw(face)
            if kind == "wall":
                for story in range(stories):
                    add(WALL_MESH, _wall_base(face, idx, cw, ch, story), WALL_S, yaw, tag=f"w{face}")
            elif kind == "door":
                door_story = int(hz)
                for story in range(stories):
                    if story == door_story:
                        add(DOOR_MESH, _door_base(face, idx, cw, ch, story), DOOR_S, yaw, tag=f"d{face}")
                    else:
                        add(WALL_MESH, _wall_base(face, idx, cw, ch, story), WALL_S, yaw, tag=f"w{face}")
            elif kind == "ledge":
                # Ledge plate on the outer edge cell — use egypt floor pivot math.
                if face in ("N", "S"):
                    ix, iy = idx, (ch - 1 if face == "N" else 0)
                else:
                    ix, iy = (cw - 1 if face == "E" else 0), idx
                add(
                    FLOOR_MESH,
                    _cell_floor_egypt(ix, iy, hz * WORLD + 6.0),
                    (FLOOR_S[0] * 0.45, FLOOR_S[1] * 0.45, FLOOR_S[2]),
                    0.0,
                    tag="ldg",
                )

    if flags.get("stair"):
        add(STAIR_MESH, (0.5 * WORLD, 0.5 * WORLD, 0.0), STAIR_S, 180.0, tag="st")
        for ix in range(cw):
            add(FLOOR_MESH, _cell_floor_egypt(ix, 1, 1 * WORLD + 6.0), FLOOR_S, tag="lf")

    if roof and not balcony:
        top_z = stories * WORLD
        for iy in range(ch):
            for ix in range(cw):
                add(FLOOR_MESH, _cell_floor_egypt(ix, iy, top_z), FLOOR_S, tag="rf")

    if flags.get("columns"):
        for cx, cy in ((0, 0), (cw - 1, 0), (0, ch - 1), (cw - 1, ch - 1)):
            add(COLUMN_MESH, _cell_floor_grid(cx, cy, 0.0), COL_S, tag="col")

    # Tiny marker cubes baked into the mesh at Slot positions (catalogue still owns logic)
    for si, sl in enumerate(slots or []):
        sx = int(sl.get("x") or 0)
        sy = int(sl.get("y") or 0)
        add(GRID_FLOOR, _cell_floor_grid(sx, sy, 64.0), (0.15, 0.15, 0.15), tag=f"slot{si}")

    # Leaf without SM_ — merge API prefixes SM_ → SM_Egypt_Entrance
    mesh_leaf = pname.replace("EP_", "", 1)  # Egypt_Entrance
    sm_package = f"{MESH_FOLDER}/{mesh_leaf}"
    merged_actor, sm_path = _merge_actors_keep(actors, sm_package, mesh_leaf)
    # Destroy merged actor — keep the SM asset only (no scene pollution)
    try:
        eas.destroy_actor(merged_actor)
    except Exception:
        pass
    # Kill any stray RGD_TMP_* that merge failed to destroy
    for a in list(eas.get_all_level_actors()):
        lab = a.get_actor_label() or ""
        if lab.startswith("RGD_TMP_") or lab == mesh_leaf:
            try:
                eas.destroy_actor(a)
            except Exception:
                pass
    e = unreal.EditorAssetLibrary.load_asset(sm_path).get_bounds().box_extent
    size = [float(e.x) * 2, float(e.y) * 2, float(e.z) * 2]
    return {
        "name": pname,
        "mesh": sm_path,
        "cw": cw,
        "ch": ch,
        "cz": cz,
        "size": size,
        "expect_xy": [cw * WORLD, ch * WORLD],
        "expect_z_min": WORLD * 0.5,
    }


def build_prefab_only(sg, pname: str, sub: str, cw: int, ch: int, cz: int, index: int) -> dict:
    """Package a single-mesh EntityPrefab. Requires Verse build so SM_* has a digest class."""
    import unreal

    mesh_leaf = pname.replace("EP_", "", 1)
    sm_path = f"{MESH_FOLDER}/SM_{mesh_leaf}"
    if not unreal.EditorAssetLibrary.does_asset_exist(sm_path):
        # merge may have written without SM_ prefix in rare cases
        alt = f"{MESH_FOLDER}/{mesh_leaf}"
        if unreal.EditorAssetLibrary.does_asset_exist(alt):
            sm_path = alt
        else:
            raise RuntimeError(f"mesh missing {sm_path} — run PHASE=mesh first, then Verse build")
    sm_obj = f"{sm_path}.{sm_path.split('/')[-1]}"

    folder = f"{ROOT_FOLDER}/{sub}"
    if not unreal.EditorAssetLibrary.does_directory_exist(folder):
        unreal.EditorAssetLibrary.make_directory(folder)
    for old in (f"{ROOT_FOLDER}/{pname}", f"{folder}/{pname}"):
        if unreal.EditorAssetLibrary.does_asset_exist(old):
            unreal.EditorAssetLibrary.delete_asset(old)

    root = f"RGD_EG_{pname}"
    mesh_ent = f"{root}_Mesh"
    _safe_destroy_entity(sg, root)
    _safe_destroy_entity(sg, mesh_ent)
    sg.create_entity(root, translation=[-700000.0 - index * 100.0, -700000.0, 0.0])
    sg.create_entity(mesh_ent, parent_entity=root, translation=[0.0, 0.0, 0.0], scale=[1.0, 1.0, 1.0])
    sg.add_entity_component(mesh_ent, "mesh_component", sm_obj)
    prefab = sg.create_prefab_from_entities([root], pname, folder)
    inst = (prefab or {}).get("instance") or root
    _safe_destroy_entity(sg, inst)
    _safe_destroy_entity(sg, root)
    _wipe_level_junk(sg)

    verify = f"VERIFY_{pname}"
    _safe_destroy_entity(sg, verify)
    try:
        sg.instantiate_prefab(f"{folder}/{pname}", translation=[-800000.0, -800000.0, 0.0], name=verify)
        vinfo = sg.get_entity_info(verify)
        bounds = vinfo.get("bounds") or {}
        ext = bounds.get("box_extent") or [0, 0, 0]
        size = [float(ext[0]) * 2, float(ext[1]) * 2, float(ext[2]) * 2]
    except Exception as e:
        bounds, size = {"error": repr(e)}, []
    finally:
        _safe_destroy_entity(sg, verify)
        _wipe_level_junk(sg)

    return {
        "name": pname,
        "prefab": f"{folder}/{pname}",
        "mesh": sm_path,
        "folder": folder,
        "cw": cw,
        "ch": ch,
        "cz": cz,
        "bounds": bounds,
        "size": size,
    }


def place_merged_verify(sm_path: str, label: str = "VERIFY_Egypt_RoomCross") -> dict:
    """Drop the baked SM at origin for viewport check. Folder: RoguelikeGame/Verify."""
    import unreal

    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    for a in list(eas.get_all_level_actors()):
        lab = a.get_actor_label() or ""
        if lab.startswith("VERIFY_Egypt") or lab.startswith("RGD_TMP_"):
            try:
                eas.destroy_actor(a)
            except Exception:
                pass
    mesh = unreal.EditorAssetLibrary.load_asset(sm_path)
    if mesh is None:
        raise RuntimeError(f"missing {sm_path}")
    actor = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0.0, 0.0, 0.0))
    actor.set_actor_label(label)
    actor.set_folder_path("RoguelikeGame/Verify")
    actor.static_mesh_component.set_static_mesh(mesh)
    actor.set_actor_transform(
        unreal.Transform(
            unreal.Vector(0.0, 0.0, 0.0),
            unreal.Rotator(pitch=0.0, yaw=0.0, roll=0.0),
            unreal.Vector(1.0, 1.0, 1.0),
        ),
        False,
        False,
    )
    b = actor.get_actor_bounds(False)
    # get_actor_bounds returns (origin, extent) in some builds; Box in others
    try:
        origin, extent = b
        size = [float(extent.x) * 2, float(extent.y) * 2, float(extent.z) * 2]
        origin_l = [float(origin.x), float(origin.y), float(origin.z)]
    except Exception:
        size, origin_l = [], []
    return {"label": label, "mesh": sm_path, "origin": origin_l, "size": size}


def build_all(start: int = 0, count: int = 1, phase: str = "mesh") -> dict:
    from listener.registry import scene_graph as sg

    phase = (phase or "mesh").lower().strip()
    _wipe_level_junk(sg)
    created = []
    errors = []
    slice_ = CHUNKS[start : start + count]
    for i, row in enumerate(slice_):
        pname, sub, cw, ch, cz, socks, slots, flags = row
        try:
            if phase == "prefab":
                created.append(build_prefab_only(sg, pname, sub, cw, ch, cz, start + i))
            elif phase == "verify":
                # Bake mesh then leave SM at origin (do not wipe verify actor).
                info = build_mesh_only(pname, cw, ch, cz, socks, slots, flags or {}, start + i)
                sm = info.get("mesh") or ""
                # merge may write SM_Egypt_* 
                alt = f"{MESH_FOLDER}/SM_{pname.replace('EP_', '', 1)}"
                if not __import__("unreal").EditorAssetLibrary.does_asset_exist(sm):
                    sm = alt
                elif not sm.endswith(pname.replace("EP_", "SM_Egypt_").replace("Egypt_", "SM_Egypt_")):
                    if __import__("unreal").EditorAssetLibrary.does_asset_exist(alt):
                        sm = alt
                v = place_merged_verify(sm if __import__("unreal").EditorAssetLibrary.does_asset_exist(sm) else alt)
                info["verify"] = v
                created.append(info)
            else:
                created.append(build_mesh_only(pname, cw, ch, cz, socks, slots, flags or {}, start + i))
        except Exception as e:
            import traceback

            errors.append({"name": pname, "error": repr(e), "tb": traceback.format_exc()[-800:]})
            break
    if phase != "verify":
        _wipe_level_junk(sg)
    try:
        import unreal

        unreal.EditorLoadingAndSavingUtils.save_dirty_packages(False, True)
    except Exception:
        pass
    out = {
        "phase": phase,
        "world_step": WORLD,
        "folder": ROOT_FOLDER,
        "mesh_folder": MESH_FOLDER,
        "created": created,
        "errors": errors,
        "next_start": start + len(created),
        "remaining": max(0, len(CHUNKS) - (start + len(created))),
        "total": len(CHUNKS),
    }
    if phase == "mesh":
        out["next"] = "workspace_compile_verse then PHASE=prefab"
        out["paths"] = {c["name"]: c["mesh"] for c in created}
    elif phase == "verify":
        out["paths"] = {c["name"]: (c.get("verify") or {}).get("mesh") for c in created}
    else:
        out["paths"] = {c["name"]: c["prefab"] for c in created}
    return out


START = int(globals().get("START", 0) or 0)
COUNT = int(globals().get("COUNT", 1) or 1)
PHASE = str(globals().get("PHASE", "mesh") or "mesh")
try:
    result = build_all(START, COUNT, PHASE)
except Exception as e:
    import traceback

    result = {"error": repr(e), "tb": traceback.format_exc()[-1200:]}
