"""Render and validate the task-local synchronized eye rig.

The report deliberately separates measurable mask/geometry checks from visual
acceptance.  It writes only below the selected task's ``_rig_assets`` folder.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

BASE_ORDER = [
    "handwear", "legwear", "topwear", "backhair", "footwear", "earwear",
    "neck", "bottomwear", "ears", "face", "nose", "mouth", "fronthair",
]
GAZE_CASES = [
    (-1, 1), (0, 1), (1, 1),
    (-1, 0), (0, 0), (1, 0),
    (-1, -1), (0, -1), (1, -1),
]
BLINK_CASES = [0.0, 0.5, 1.0]


def with_opacity(image: Image.Image, opacity: float) -> Image.Image:
    result = image.copy()
    result.putalpha(result.getchannel("A").point(lambda value: round(value * opacity)))
    return result


def shift(image: Image.Image, dx: float, dy: float) -> Image.Image:
    return image.transform(
        image.size,
        Image.Transform.AFFINE,
        (1, 0, -dx, 0, 1, -dy),
        resample=Image.Resampling.BILINEAR,
    )


def squash(image: Image.Image, center_y: float, factor: float) -> Image.Image:
    factor = max(0.06, factor)
    return image.transform(
        image.size,
        Image.Transform.AFFINE,
        (1, 0, 0, 0, 1 / factor, center_y - center_y / factor),
        resample=Image.Resampling.BICUBIC,
    )


def masked_iris(iris: Image.Image, white: Image.Image, dx: float, dy: float) -> tuple[Image.Image, dict]:
    moved = shift(iris, dx, dy)
    source_alpha, mask_alpha = moved.getchannel("A"), white.getchannel("A")
    clipped = moved.copy()
    clipped.putalpha(ImageChops.multiply(source_alpha, mask_alpha))
    source_values, mask_values, clipped_values = source_alpha.getdata(), mask_alpha.getdata(), clipped.getchannel("A").getdata()
    outside_before = sum(value > 8 and mask == 0 for value, mask in zip(source_values, mask_values))
    outside_after = sum(value > 0 and mask == 0 for value, mask in zip(clipped_values, mask_values))
    total = sum(source_values)
    retained = sum(clipped_values) / total if total else 0
    return clipped, {"outsidePixelsBeforeMask": outside_before, "outsidePixelsAfterMask": outside_after, "retainedAlpha": round(retained, 6)}


def eye_crop(manifest: dict) -> tuple[int, int, int, int]:
    boxes = []
    for layer in ("irides", "eyewhite", "eyelash"):
        boxes.extend(manifest["layers"][layer][side]["bbox"] for side in ("left", "right"))
    boxes.extend(manifest.get("closedEyelids", {}).get("layers", {}).get(side, {}).get("bbox", []) for side in ("left", "right"))
    boxes = [box for box in boxes if len(box) == 4]
    x0 = min(box[0] for box in boxes) - 14
    y0 = min(box[1] for box in boxes) - 14
    x1 = max(box[2] for box in boxes) + 14
    y1 = max(box[3] for box in boxes) + 14
    width, height = manifest["canvas"]
    return max(0, x0), max(0, y0), min(width, x1), min(height, y1)


def contact_sheet(frames: list[tuple[str, Image.Image]], columns: int, scale: int = 4) -> Image.Image:
    cell_w = max(image.width for _, image in frames) * scale
    cell_h = max(image.height for _, image in frames) * scale + 24
    rows = (len(frames) + columns - 1) // columns
    sheet = Image.new("RGB", (cell_w * columns, cell_h * rows), "#20242b")
    draw = ImageDraw.Draw(sheet)
    for index, (label, image) in enumerate(frames):
        x, y = index % columns * cell_w, index // columns * cell_h
        enlarged = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
        checker = Image.new("RGBA", enlarged.size, (235, 235, 235, 255))
        checker.alpha_composite(enlarged)
        sheet.paste(checker.convert("RGB"), (x, y + 24))
        draw.text((x + 6, y + 5), label, fill="white")
    return sheet


def validate(task: Path, visual_status: str, visual_note: str) -> dict:
    task = task.resolve()
    assets = task / "_rig_assets"
    manifest = json.loads((assets / "eye_assets.json").read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 2:
        raise ValueError("eye assets must be regenerated with schemaVersion 2")
    if manifest.get("mask", {}).get("source") != "eyewhite_alpha":
        raise ValueError("eyewhite alpha mask contract is missing")

    crop_box = eye_crop(manifest)
    layers = {name: Image.open(task / f"{name}.png").convert("RGBA").crop(crop_box) for name in BASE_ORDER}
    eye_layers = {
        f"{kind}_{side}": Image.open(assets / f"{kind}_{side}.png").convert("RGBA").crop(crop_box)
        for kind in ("eyewhite", "irides", "eyelash") for side in ("left", "right")
    }
    approved = manifest.get("closedEyelids", {})
    approved_ok = approved.get("schemaVersion") == 3 and approved.get("visualReview", {}).get("status") == "passed"
    closed_layers = {}
    if approved_ok:
        closed_dir = assets / approved["assetDirectory"]
        closed_layers = {side: Image.open(closed_dir / f"eyelid_closed_{side}.png").convert("RGBA").crop(crop_box) for side in ("left", "right")}

    canvas_width, canvas_height = manifest["canvas"]
    width, height = crop_box[2] - crop_box[0], crop_box[3] - crop_box[1]
    limits = manifest["limits"]["pixels"]
    centers = manifest["eyeCenters"]
    gaze_results = []

    def render(gaze: tuple[int, int], blink: float) -> tuple[Image.Image, list[dict]]:
        canvas = Image.new("RGBA", (width, height))
        for name in BASE_ORDER[:-1]:
            canvas.alpha_composite(layers[name])
        magnitude = max(1.0, math.hypot(*gaze))
        dx, dy = gaze[0] / magnitude * limits["x"], -gaze[1] / magnitude * limits["y"]
        closure = blink * blink
        open_opacity = 1 - closure
        metrics = []
        prepared = {}
        for side in ("left", "right"):
            white = eye_layers[f"eyewhite_{side}"]
            iris, metric = masked_iris(eye_layers[f"irides_{side}"], white, dx, dy)
            metric.update({"side": side, "offsetPixels": [round(dx, 6), round(dy, 6)]})
            metrics.append(metric)
            center_y = (1 - centers[side][1]) * canvas_height / 2 - crop_box[1]
            prepared[f"white_{side}"] = with_opacity(squash(white, center_y, 1 - closure), open_opacity)
            prepared[f"iris_{side}"] = with_opacity(squash(iris, center_y, 1 - closure), open_opacity)
            prepared[f"lash_{side}"] = with_opacity(squash(eye_layers[f"eyelash_{side}"], center_y, 1 - closure), open_opacity)
        for kind in ("white", "iris", "lash"):
            for side in ("left", "right"):
                canvas.alpha_composite(prepared[f"{kind}_{side}"])
        closed_opacity = closure
        for side in ("left", "right"):
            if side in closed_layers:
                canvas.alpha_composite(with_opacity(closed_layers[side], closed_opacity))
        canvas.alpha_composite(Image.open(task / "eyebrow.png").convert("RGBA").crop(crop_box))
        canvas.alpha_composite(layers["fronthair"])
        return canvas, metrics

    gaze_frames = []
    for gaze in GAZE_CASES:
        frame, metrics = render(gaze, 0)
        gaze_frames.append((f"gaze {gaze[0]:+d}, {gaze[1]:+d}", frame))
        gaze_results.append({"gaze": list(gaze), "sharedOffsetPixels": metrics[0]["offsetPixels"], "eyes": metrics})

    blink_frames = []
    for blink in BLINK_CASES:
        frame, _ = render((0, 0), blink)
        blink_frames.append((f"blink {round(blink * 100):03d}%", frame))

    validation_dir = assets / "_validation"
    validation_dir.mkdir(exist_ok=True)
    gaze_path = validation_dir / "gaze_nine_grid.png"
    blink_path = validation_dir / "blink_open_half_closed.png"
    contact_sheet(gaze_frames, 3).save(gaze_path)
    contact_sheet(blink_frames, 3).save(blink_path)

    all_metrics = [eye for case in gaze_results for eye in case["eyes"]]
    separation = centers["right"][0] - centers["left"][0]
    neutral_case = next(case for case in gaze_results if case["gaze"] == [0, 0])
    neutral_retained = {eye["side"]: eye["retainedAlpha"] for eye in neutral_case["eyes"]}
    minimum_relative = min(
        eye["retainedAlpha"] / neutral_retained[eye["side"]]
        for eye in all_metrics if neutral_retained[eye["side"]]
    )
    checks = {
        "sharedVectorForBothEyes": all(case["eyes"][0]["offsetPixels"] == case["eyes"][1]["offsetPixels"] for case in gaze_results),
        "maskRemovesAllOutsideAlpha": all(metric["outsidePixelsAfterMask"] == 0 for metric in all_metrics),
        "minimumRelativeCoverageAtExtremes": minimum_relative >= manifest["mask"]["minimumRelativeCoverage"],
        "neutralHasNoOffset": neutral_case["sharedOffsetPixels"] == [0, 0],
        "eyeCenterOrderIsStable": separation > 0,
        "approvedClosedEyelidsAvailable": approved_ok,
        "blinkStatesRendered": len(blink_frames) == 3,
        "nineGazeStatesRendered": len(gaze_frames) == 9,
    }
    report = {
        "schemaVersion": 1,
        "task": task.name,
        "contract": "one shared gaze vector; per-eye eyewhite alpha clipping; approved eyelid occlusion",
        "limits": manifest["limits"],
        "eyeCenters": centers,
        "centerSeparation": round(separation, 6),
        "minimumRelativeCoverage": round(minimum_relative, 6),
        "checks": checks,
        "automatedStatus": "passed" if all(checks.values()) else "failed",
        "gazeCases": gaze_results,
        "blinkCases": BLINK_CASES,
        "previews": [gaze_path.name, blink_path.name],
        "visualReview": {"status": visual_status, "note": visual_note},
    }
    (validation_dir / "eye_rig_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_dir", type=Path)
    parser.add_argument("--visual-status", choices=("pending", "passed", "failed"), default="pending")
    parser.add_argument("--visual-note", default="Automated output generated; inspect both contact sheets before delivery.")
    args = parser.parse_args()
    print(json.dumps(validate(args.task_dir, args.visual_status, args.visual_note), indent=2))


if __name__ == "__main__":
    main()
