"""Derive safe left/right eye assets from a validated see-through task.

This never edits source PNGs or PSDs.  It writes full-canvas RGBA derivatives
under <task>/_rig_assets/ so a rig can move each eye independently.  The
eyewhite alpha is the runtime iris mask; the shared gaze limits are measured
from both eyes so they cannot diverge into a cross-eyed pose.
"""
from __future__ import annotations

import argparse
import json
import math
from collections import deque
from pathlib import Path

from PIL import Image


def components(alpha: Image.Image, threshold: int = 8, min_pixels: int = 20):
    width, height = alpha.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    found = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or pixels[x, y] <= threshold:
                continue
            queue = deque([(x, y)])
            seen[index] = 1
            points = []
            while queue:
                px, py = queue.popleft()
                points.append((px, py))
                for nx, ny in ((px + 1, py), (px - 1, py), (px, py + 1), (px, py - 1)):
                    nindex = ny * width + nx
                    if 0 <= nx < width and 0 <= ny < height and not seen[nindex] and pixels[nx, ny] > threshold:
                        seen[nindex] = 1
                        queue.append((nx, ny))
            if len(points) >= min_pixels:
                xs, ys = zip(*points)
                found.append({"pixels": len(points), "bbox": [min(xs), min(ys), max(xs) + 1, max(ys) + 1]})
    return sorted(found, key=lambda part: part["pixels"], reverse=True)


def split(source: Image.Image, left_box: list[int], right_box: list[int]):
    width, height = source.size
    midpoint = (left_box[0] + left_box[2] + right_box[0] + right_box[2]) / 4
    left = Image.new("RGBA", (width, height))
    right = Image.new("RGBA", (width, height))
    left.paste(source.crop((0, 0, int(midpoint), height)), (0, 0))
    right.paste(source.crop((int(midpoint), 0, width, height)), (int(midpoint), 0))
    return left, right, midpoint


def alpha_summary(image: Image.Image, threshold: int = 8) -> dict:
    alpha = image.getchannel("A")
    extent = alpha.getbbox()
    if not extent:
        raise ValueError("derived eye layer is empty")
    points = [(x, y) for y in range(extent[1], extent[3]) for x in range(extent[0], extent[2]) if alpha.getpixel((x, y)) > threshold]
    if not points:
        raise ValueError("derived eye layer is empty")
    xs, ys = zip(*points)
    return {"pixels": len(points), "bbox": [min(xs), min(ys), max(xs) + 1, max(ys) + 1]}


def retained_fraction(iris: Image.Image, white: Image.Image, dx: int, dy: int, threshold: int = 8) -> float:
    """Return alpha-weighted iris coverage after an integer gaze offset."""
    iris_alpha, white_alpha = iris.getchannel("A"), white.getchannel("A")
    total = kept = 0.0
    extent = iris_alpha.getbbox()
    if not extent:
        return 0.0
    for y in range(extent[1], extent[3]):
        for x in range(extent[0], extent[2]):
            value = iris_alpha.getpixel((x, y))
            if value <= threshold:
                continue
            total += value
            target_x, target_y = x + dx, y + dy
            if 0 <= target_x < white_alpha.width and 0 <= target_y < white_alpha.height:
                kept += value * white_alpha.getpixel((target_x, target_y)) / 255
    return kept / total if total else 0.0


def shared_safe_radius(pairs: list[tuple[Image.Image, Image.Image]], axis: str,
                       max_radius: int = 4, minimum_relative_coverage: float = 0.92) -> int:
    """Find one symmetric limit that is safe for both eyes and directions."""
    baselines = [retained_fraction(iris, white, 0, 0) for iris, white in pairs]
    safe = 0
    for radius in range(1, max_radius + 1):
        valid = True
        for (iris, white), baseline in zip(pairs, baselines):
            for sign in (-1, 1):
                dx, dy = (sign * radius, 0) if axis == "x" else (0, sign * radius)
                relative = retained_fraction(iris, white, dx, dy) / baseline if baseline else 0
                if relative < minimum_relative_coverage:
                    valid = False
        if not valid:
            break
        safe = radius
    return safe


def bilinear(alpha: Image.Image, x: float, y: float) -> float:
    if x < 0 or y < 0 or x > alpha.width - 1 or y > alpha.height - 1:
        return 0.0
    x0, y0 = math.floor(x), math.floor(y)
    x1, y1 = min(x0 + 1, alpha.width - 1), min(y0 + 1, alpha.height - 1)
    fx, fy = x - x0, y - y0
    return (
        alpha.getpixel((x0, y0)) * (1 - fx) * (1 - fy)
        + alpha.getpixel((x1, y0)) * fx * (1 - fy)
        + alpha.getpixel((x0, y1)) * (1 - fx) * fy
        + alpha.getpixel((x1, y1)) * fx * fy
    )


def retained_fraction_float(iris: Image.Image, white: Image.Image, dx: float, dy: float,
                            threshold: int = 8) -> float:
    iris_alpha, white_alpha = iris.getchannel("A"), white.getchannel("A")
    extent = iris_alpha.getbbox()
    if not extent:
        return 0.0
    total = kept = 0.0
    for y in range(extent[1], extent[3]):
        for x in range(extent[0], extent[2]):
            value = iris_alpha.getpixel((x, y))
            if value <= threshold:
                continue
            total += value
            kept += value * bilinear(white_alpha, x + dx, y + dy) / 255
    return kept / total if total else 0.0


def jointly_safe_radii(pairs: list[tuple[Image.Image, Image.Image]], safe_x: int, safe_y: int,
                       minimum_relative_coverage: float = 0.92) -> tuple[int, int]:
    """Reduce axis radii until unit-circle corners also satisfy both eyes."""
    baselines = [retained_fraction_float(iris, white, 0, 0) for iris, white in pairs]
    while safe_x and safe_y:
        valid = True
        for (iris, white), baseline in zip(pairs, baselines):
            for x_sign in (-1, 1):
                for y_sign in (-1, 1):
                    dx = x_sign * safe_x / math.sqrt(2)
                    dy = y_sign * safe_y / math.sqrt(2)
                    if retained_fraction_float(iris, white, dx, dy) / baseline < minimum_relative_coverage:
                        valid = False
        if valid:
            break
        if safe_x >= safe_y:
            safe_x -= 1
        else:
            safe_y -= 1
    return safe_x, safe_y


def derive(task_dir: Path) -> dict:
    task_dir = task_dir.resolve()
    sources = {name: Image.open(task_dir / f"{name}.png").convert("RGBA") for name in ("irides", "eyewhite", "eyelash")}
    if sources["irides"].size != sources["eyewhite"].size:
        raise ValueError("irides and eyewhite canvas sizes differ")
    if sources["eyelash"].size != sources["eyewhite"].size:
        raise ValueError("eyelash and eyewhite canvas sizes differ")
    output = task_dir / "_rig_assets"
    output.mkdir(exist_ok=True)
    previous = {}
    manifest_path = output / "eye_assets.json"
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text(encoding="utf-8"))
    report = {
        "schemaVersion": 2,
        "canvas": list(sources["irides"].size),
        "layers": {},
        "mask": {
            "source": "eyewhite_alpha",
            "sampling": "destination_uv",
            "alphaThreshold": 8,
            "minimumRelativeCoverage": 0.92,
        },
    }
    all_parts = {}
    split_layers = {}
    for name, image in ((name, sources[name]) for name in ("irides", "eyewhite")):
        parts = sorted(components(image.getchannel("A"))[:2], key=lambda part: part["bbox"][0])
        if len(parts) != 2:
            raise ValueError(f"{name} needs exactly two significant connected alpha regions; found {len(parts)}")
        left, right, midpoint = split(image, parts[0]["bbox"], parts[1]["bbox"])
        left.save(output / f"{name}_left.png")
        right.save(output / f"{name}_right.png")
        report["layers"][name] = {"left": parts[0], "right": parts[1], "midpoint": midpoint}
        all_parts[name] = parts
        split_layers[name] = {"left": left, "right": right}

    # Eyelashes can contain several disconnected strokes per eye.  Split them
    # at the measured eye midpoint instead of pretending they are two simple
    # connected components.
    left_lash, right_lash, lash_midpoint = split(
        sources["eyelash"], all_parts["eyewhite"][0]["bbox"], all_parts["eyewhite"][1]["bbox"]
    )
    for side, image in (("left", left_lash), ("right", right_lash)):
        image.save(output / f"eyelash_{side}.png")
    report["layers"]["eyelash"] = {
        "left": alpha_summary(left_lash),
        "right": alpha_summary(right_lash),
        "midpoint": lash_midpoint,
    }

    # Measure one symmetric radius from the actual alpha geometry.  Both eyes
    # receive the exact same normalized gaze vector; the more constrained eye
    # decides the shared range.
    width, height = sources["irides"].size
    pairs = [(split_layers["irides"][side], split_layers["eyewhite"][side]) for side in ("left", "right")]
    safe_x = shared_safe_radius(pairs, "x")
    safe_y = shared_safe_radius(pairs, "y")
    safe_x, safe_y = jointly_safe_radii(pairs, safe_x, safe_y)
    report["limits"] = {
        "gazeX": round(safe_x * 2 / width, 6),
        "gazeY": round(safe_y * 2 / height, 6),
        "pixels": {"x": safe_x, "y": safe_y},
    }
    # The renderer works in a [-1, 1] canvas with +Y upward.  Persisting the
    # measured eye centre prevents a generic facial pivot from making a blink
    # collapse at the wrong vertical location on a differently framed image.
    height = sources["irides"].height
    centers_px = [
        ((part["bbox"][0] + part["bbox"][2]) / 2, (part["bbox"][1] + part["bbox"][3]) / 2)
        for part in all_parts["irides"]
    ]
    centers = [
        [round(x * 2 / width - 1, 6), round(1 - y * 2 / height, 6)]
        for x, y in centers_px
    ]
    report["eyeCenters"] = dict(zip(("left", "right"), centers))
    report["eyeCenter"] = [
        round(sum(center[0] for center in centers) / len(centers), 6),
        round(sum(center[1] for center in centers) / len(centers), 6),
    ]
    # Re-deriving geometry must not silently discard a separately approved,
    # versioned eyelid set.
    if "closedEyelids" in previous:
        report["closedEyelids"] = previous["closedEyelids"]
    manifest_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_dir", type=Path)
    args = parser.parse_args()
    print(json.dumps(derive(args.task_dir), indent=2))


if __name__ == "__main__":
    main()
