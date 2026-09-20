"""Promote one user-reviewed shoulder/neck repair into task-local rig assets."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil

from PIL import Image


LAYER_NAMES = ("seam_repair_head", "seam_repair_torso")


def promote(task: Path, candidate: str, approval: str) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", candidate) or not approval.strip():
        raise ValueError("A safe candidate name and explicit approval record are required")
    task = Path(task).resolve()
    source = task / "_rig_candidates" / candidate
    report = json.loads((source / "report.json").read_text(encoding="utf-8"))
    if report.get("schemaVersion") != 2 or report.get("source") != "registered_original" or report.get("status") != "candidate":
        raise ValueError("Only registered seam-repair candidates may be promoted")
    with Image.open(task / "face.png") as face:
        canvas = face.size
    for name in LAYER_NAMES:
        path = source / f"{name}.png"
        with Image.open(path) as image:
            if image.mode != "RGBA" or image.size != canvas or not image.getchannel("A").getbbox():
                raise ValueError("Invalid seam candidate RGBA: " + name)

    assets = task / "_rig_assets"
    assets.mkdir(exist_ok=True)
    active = assets / "seam_assets.json"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    version = f"{candidate}_{stamp}"
    destination = assets / version
    destination.mkdir()
    for name in LAYER_NAMES:
        shutil.copy2(source / f"{name}.png", destination / f"{name}.png")
    promoted = {
        "schemaVersion": 1,
        "source": "registered_original",
        "assetDirectory": version,
        "layers": list(LAYER_NAMES),
        "registration": report.get("registration"),
        "coverage": report.get("coverage"),
        "visualReview": {
            "status": "passed",
            "reviewer": "user",
            "approval": approval,
            "acceptedAt": stamp,
        },
        "assetSha256": {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in destination.glob("*.png")
        },
    }
    (destination / "report.json").write_text(json.dumps(promoted, indent=2, ensure_ascii=False), encoding="utf-8")
    rollback = None
    if active.exists():
        rollback = assets / f"seam_assets.before_{stamp}.json"
        shutil.copy2(active, rollback)
    pending = assets / f"seam_assets.{stamp}.tmp"
    pending.write_text(json.dumps(promoted, indent=2, ensure_ascii=False), encoding="utf-8")
    pending.replace(active)
    return {
        "active": str(active),
        "assets": str(destination),
        "rollbackManifest": str(rollback) if rollback else None,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("task", type=Path)
    parser.add_argument("candidate")
    parser.add_argument("--approval", required=True)
    args = parser.parse_args()
    print(json.dumps(promote(args.task, args.candidate, args.approval), indent=2, ensure_ascii=False))
