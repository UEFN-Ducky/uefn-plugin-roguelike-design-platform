"""Assert Content/ ↔ /Mount/ path helpers (run: py -3 -m backend.test_content_paths)."""
from __future__ import annotations

from .chunks import content_disk_path, normalize_chunk, normalize_chunk_asset, normalize_uefn_content_path


def main() -> None:
    assert content_disk_path("/Roguelike/Prefabs/Chunks/Egypt/EP_Egypt_RoomNS") == (
        "Content/Prefabs/Chunks/Egypt/EP_Egypt_RoomNS"
    )
    assert normalize_uefn_content_path("Content/Meshes/SM_TileWall") == (
        "/Roguelike/Meshes/SM_TileWall"
    )
    a = normalize_chunk_asset(
        {"id": "kit_arch", "assetPath": "Content/Meshes/SM_TileWall", "kind": "arch"}
    )
    assert a and a["preview"] == "arch" and a["contentPath"].startswith("Content/")
    c = normalize_chunk(
        {
            "id": "t",
            "prefabPath": "Content/Prefabs/Chunks/Egypt/EP_Egypt_RoomNS",
            "cw": 2,
            "ch": 2,
            "sockets": {},
        }
    )
    assert c["prefabPath"] == "/Roguelike/Prefabs/Chunks/Egypt/EP_Egypt_RoomNS"
    assert c["contentPath"] == "Content/Prefabs/Chunks/Egypt/EP_Egypt_RoomNS"
    print("test_content_paths: ok")


if __name__ == "__main__":
    main()
