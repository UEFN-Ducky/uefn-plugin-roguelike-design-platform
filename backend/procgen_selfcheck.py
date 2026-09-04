#!/usr/bin/env python3
"""Assert-based self-check for the chunk procgen pipeline. Run: py -3 -m backend.procgen_selfcheck"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `py -3 backend/procgen_selfcheck.py` from plugin root
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.chunks import DEFAULT_CHUNKS, DEFAULT_GEN_TEMPLATES  # noqa: E402
from backend.procgen import generate_layout, placement_hash  # noqa: E402


def main() -> None:
    tpl = next(t for t in DEFAULT_GEN_TEMPLATES if t["id"] == "gen_linear_gauntlet")
    # Loosen metrics slightly for synthetic set
    tpl = dict(tpl)
    tpl["metrics"] = {"mainPathLen": [3, 80]}
    tpl["maxAttempts"] = 30

    n = 200
    ok_count = 0
    total_rollbacks = 0
    golden = None
    golden_hash = None

    for i in range(n):
        seed = 1000 + i
        res = generate_layout(DEFAULT_CHUNKS, tpl, seed=seed)
        if not res.get("ok"):
            continue
        ok_count += 1
        total_rollbacks += int((res.get("stats") or {}).get("rollbacks") or 0)
        layout = res.get("layout") or []
        # zero cell overlaps
        cells = set()
        for p in layout:
            for dy in range(int(p.get("ch") or 1)):
                for dx in range(int(p.get("cw") or 1)):
                    key = (int(p["cx"]) + dx, int(p["cy"]) + dy)
                    assert key not in cells, f"overlap at {key} seed={seed}"
                    cells.add(key)
        path = res.get("mainPath") or []
        assert len(path) >= 2, f"no path seed={seed}"
        # reachability implied by mainPath
        if golden is None:
            golden = seed
            golden_hash = placement_hash(layout)

    rate = ok_count / float(n)
    print(f"success {ok_count}/{n} ({rate:.1%}) avg_rollbacks={total_rollbacks / max(1, ok_count):.1f}")
    print(f"golden seed={golden} hash={golden_hash}")
    assert rate >= 0.55, f"success rate {rate:.1%} below 55%"
    assert ok_count > 0 and golden_hash, "no successful layout"
    # Reproducibility of golden seed
    again = generate_layout(DEFAULT_CHUNKS, tpl, seed=golden)
    assert again.get("ok"), "golden seed failed on replay"
    assert placement_hash(again.get("layout") or []) == golden_hash, "golden hash drift"
    print("procgen_selfcheck: OK")


if __name__ == "__main__":
    main()
