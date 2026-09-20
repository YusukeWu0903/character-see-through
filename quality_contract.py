"""Fail-closed production quality contract and delivery preflight."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


PROJECT = Path(__file__).resolve().parent
BASELINE_PATH = PROJECT / "viewer" / "quality-baseline.json"
LOCKED_PRODUCTION = {
    "inference": {"layerResolution": 1280, "steps": 30, "depthResolution": 768},
    "viewer": {
        "textureUploadMode": "native",
        "textureUploadMax": 1280,
        "maxDevicePixelRatio": 2,
        "approvedSeamsRequired": True,
        "controls": {
            "body": 0, "torso": 0, "head": 0, "breath": 30, "hair": 10,
            "energy": 55, "bust": 28, "yaw": 0, "gaze-x": 0,
            "gaze-y": 0, "blink": 0,
        },
        "toggles": {
            "idle": True, "follow": True, "gaze-follow": True,
            "auto-blink": True, "paused": False, "calibrate": False,
        },
    },
}
LOCKED_ACCEPTED_TASKS = {
    "Eris_full_body_casual_20260918_113905": {
        "gazePixels": {"x": 2.0, "y": 1.5},
        "closedEyelidSha256": {
            "eyelid_closed_left.png": "ca46bba3f4a5c4169d120a2c5beebc88286c5aae8e04acbbbb51ac6c1d92c223",
            "eyelid_closed_right.png": "679825331561794daf125ae9eafbb6a943c1c7bd1df319d04ffdc5fa42996edf",
        },
        "seamRepairSha256": {
            "seam_repair_head.png": "601335ec2e1d0841e76fe407b12bd39fc5a830b3ea48cb31e3dd474631590548",
            "seam_repair_torso.png": "d575a83d90c4780507e4f4eb603d7087971690591dc31a50ae6c592654c586dc",
        },
    }
}


def load_quality_baseline(path: Path = BASELINE_PATH) -> dict:
    baseline = json.loads(path.read_text(encoding="utf-8"))
    if baseline.get("schemaVersion") != 1:
        raise ValueError("unsupported quality baseline schema")
    if baseline.get("production") != LOCKED_PRODUCTION:
        raise ValueError(
            "production quality baseline changed; explicit user approval and a new "
            "decision record are required before updating the locked contract"
        )
    if baseline.get("acceptedTasks") != LOCKED_ACCEPTED_TASKS:
        raise ValueError("accepted task state changed without a new explicit approval record")
    profiles = baseline.get("nonProductionProfiles", {})
    for name, profile in profiles.items():
        if (profile.get("nonProduction") is not True
                or not profile.get("visibleLabel")
                or not 0 < profile.get("textureUploadMax", 0) < 1280):
            raise ValueError(f"invalid non-production profile: {name}")
    control = baseline.get("changeControl", {})
    if control.get("baselineChangesRequireExplicitUserApproval") is not True:
        raise ValueError("baseline change control may not be disabled")
    record = PROJECT / control.get("decisionRecord", "")
    if not record.is_file():
        raise ValueError("quality baseline decision record is missing")
    return baseline


def verify_repository() -> dict:
    baseline = load_quality_baseline()
    viewer = (PROJECT / "viewer" / "deform-preview.mjs").read_text(encoding="utf-8")
    browser_test = (PROJECT / "tests" / "check_eye_rig_browser.cjs").read_text(encoding="utf-8")
    runner = (PROJECT / "run_seethrough_local.py").read_text(encoding="utf-8")
    if "texture-max" in viewer:
        raise ValueError("viewer still exposes an arbitrary texture-max downgrade")
    if "quality-profile=browser-validation" not in browser_test:
        raise ValueError("browser validation is not isolated in its named non-production profile")
    if "load_quality_baseline()" not in runner:
        raise ValueError("inference defaults are not sourced from the production baseline")
    return baseline


def verify_task(task: Path, baseline: dict) -> None:
    order_path = task / "_order.json"
    if not order_path.is_file():
        raise ValueError(f"missing task order: {order_path}")
    expected = baseline["production"]["inference"]["layerResolution"]
    entries = json.loads(order_path.read_text(encoding="utf-8"))
    if not entries:
        raise ValueError("task contains no layers")
    wrong = []
    for entry in entries:
        path = task / entry["file"]
        if not path.is_file():
            wrong.append(f"{entry['file']}: missing")
            continue
        with Image.open(path) as image:
            if image.size != (expected, expected):
                wrong.append(f"{entry['file']}: {image.size[0]}x{image.size[1]}")
    if wrong:
        raise ValueError("task violates native layer resolution: " + ", ".join(wrong))
    accepted = baseline.get("acceptedTasks", {}).get(task.name)
    if not accepted:
        return
    rig_assets = task / "_rig_assets"
    eye_manifest = json.loads((rig_assets / "eye_assets.json").read_text(encoding="utf-8"))
    if eye_manifest.get("limits", {}).get("pixels") != accepted["gazePixels"]:
        raise ValueError("accepted gaze range regressed or changed")
    eyelids = eye_manifest.get("closedEyelids", {})
    if (eyelids.get("source") != "hairless_head_artwork"
            or eyelids.get("visualReview", {}).get("status") != "passed"
            or eyelids.get("assetSha256") != accepted["closedEyelidSha256"]):
        raise ValueError("accepted closed-eyelid state is missing or changed")
    seam_manifest = json.loads((rig_assets / "seam_assets.json").read_text(encoding="utf-8"))
    if (seam_manifest.get("source") != "registered_original"
            or seam_manifest.get("visualReview", {}).get("status") != "passed"
            or seam_manifest.get("assetSha256") != accepted["seamRepairSha256"]):
        raise ValueError("accepted shoulder/neck seam repair is missing or changed")
    for manifest, hashes in ((eyelids, accepted["closedEyelidSha256"]),
                             (seam_manifest, accepted["seamRepairSha256"])):
        asset_dir = rig_assets / manifest["assetDirectory"]
        for filename, expected_hash in hashes.items():
            actual_hash = hashlib.sha256((asset_dir / filename).read_bytes()).hexdigest()
            if actual_hash != expected_hash:
                raise ValueError(f"accepted asset bytes changed: {filename}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify locked production quality defaults")
    parser.add_argument("--task", type=Path)
    args = parser.parse_args()
    baseline = verify_repository()
    if args.task:
        verify_task(args.task, baseline)
    print("PASS: production quality contract is locked and runtime/test profiles are isolated")


if __name__ == "__main__":
    main()
