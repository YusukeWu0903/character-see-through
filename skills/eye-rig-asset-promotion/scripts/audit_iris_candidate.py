"""Mechanical eye-candidate audit using Eris's measured alpha-coverage rule."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from derive_eye_assets import retained_fraction_float  # noqa: E402


def check_asset(folder: Path, entry: dict, canvas: tuple[int, int]) -> Image.Image:
    path = folder / entry["asset"]
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest().upper() != entry["sha256"]:
        raise ValueError(f"asset hash mismatch: {path}")
    image = Image.open(path).convert("RGBA")
    if image.size != canvas:
        raise ValueError(f"wrong canvas: {path}")
    return image


def audit(path: Path, dark_threshold: int = 155) -> dict:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    derived = json.loads(Path(manifest["semanticSource"]).read_text(encoding="utf-8"))
    if manifest.get("maskContract") != "same-side eyewhite alpha at iris destination":
        raise ValueError("candidate lacks the same-side eyewhite mask contract")
    if derived.get("mask", {}).get("source") != "eyewhite_alpha":
        raise ValueError("semantic source lacks the Eris eye-mask contract")
    canvas = tuple(manifest["canvas"])
    if canvas != tuple(derived["canvas"]):
        raise ValueError("candidate and semantic canvas differ")
    limits = manifest["gazeLimit"]
    minimum = derived["mask"]["minimumRelativeCoverage"]
    results = []
    for side in ("left", "right"):
        spec = manifest["eyes"][side]
        iris = check_asset(path.parent, spec["iris"], canvas)
        white = check_asset(path.parent, spec["white"], canvas)
        mask = check_asset(path.parent, spec["mask"], canvas)
        lash = check_asset(path.parent, spec["lash"], canvas)
        neutral = retained_fraction_float(iris, mask, 0, 0)
        if neutral <= 0:
            raise ValueError(f"{side}: empty or unmasked iris")
        cases = []
        for y in (-1, 0, 1):
            for x in (-1, 0, 1):
                length = max(1.0, math.hypot(x, y))
                dx, dy = x / length * limits[0], y / length * limits[1]
                relative = retained_fraction_float(iris, mask, dx, dy) / neutral
                cases.append({"input": [x, y], "relativeCoverage": round(relative, 6)})
        bbox = derived["layers"]["irides"][side]["bbox"]
        white_px, lash_px = white.load(), lash.getchannel("A").load()
        stationary_dark_without_lash = sum(
            sum(white_px[x, y][:3]) / 3 < dark_threshold and lash_px[x, y] <= 8
            for y in range(bbox[1], bbox[3]) for x in range(bbox[0], bbox[2])
        )
        results.append({
            "side": side,
            "minimumRelativeCoverage": min(case["relativeCoverage"] for case in cases),
            "stationaryDarkPixelsOutsideLash": stationary_dark_without_lash,
            "nineDirections": cases,
        })
    checks = {
        "measuredNineDirectionCoverage": all(
            side["minimumRelativeCoverage"] >= minimum for side in results
        ),
        "noStationaryDarkIrisOutsideLash": all(
            side["stationaryDarkPixelsOutsideLash"] == 0 for side in results
        ),
        "leftRightOrder": manifest["eyes"]["left"]["center"][0]
        < manifest["eyes"]["right"]["center"][0],
    }
    return {
        "candidate": str(path),
        "minimumRequiredCoverage": minimum,
        "checks": checks,
        "results": results,
        "status": "machine_pass" if all(checks.values()) else "review",
        "reminder": "Inspect the eye-free backing, iris, white mask and moving nine-grid; numeric checks are not artistic approval.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--dark-threshold", type=int, default=155)
    args = parser.parse_args()
    report = audit(args.manifest, args.dark_threshold)
    print(json.dumps(report, indent=2))
    if report["status"] != "machine_pass":
        raise SystemExit(2)
