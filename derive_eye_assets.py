"""Derive safe left/right eye assets from a validated see-through task.

This never edits source PNGs or PSDs.  It writes full-canvas RGBA derivatives
under <task>/_rig_assets/ so a rig can move each eye independently.
"""
from __future__ import annotations

import argparse
import json
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


def derive(task_dir: Path) -> dict:
    task_dir = task_dir.resolve()
    sources = {name: Image.open(task_dir / f"{name}.png").convert("RGBA") for name in ("irides", "eyewhite")}
    if sources["irides"].size != sources["eyewhite"].size:
        raise ValueError("irides and eyewhite canvas sizes differ")
    report = {"schemaVersion": 1, "canvas": list(sources["irides"].size), "layers": {}}
    output = task_dir / "_rig_assets"
    output.mkdir(exist_ok=True)
    all_parts = {}
    for name, image in sources.items():
        parts = sorted(components(image.getchannel("A"))[:2], key=lambda part: part["bbox"][0])
        if len(parts) != 2:
            raise ValueError(f"{name} needs exactly two significant connected alpha regions; found {len(parts)}")
        left, right, midpoint = split(image, parts[0]["bbox"], parts[1]["bbox"])
        left.save(output / f"{name}_left.png")
        right.save(output / f"{name}_right.png")
        report["layers"][name] = {"left": parts[0], "right": parts[1], "midpoint": midpoint}
        all_parts[name] = parts

    # Convert usable horizontal pixel margins to normalized full-canvas units.
    width = sources["irides"].width
    margins = []
    for iris, white in zip(all_parts["irides"], all_parts["eyewhite"]):
        margins.extend([iris["bbox"][0] - white["bbox"][0], white["bbox"][2] - iris["bbox"][2]])
    safe_px = max(0, min(margins) - 1)
    report["limits"] = {"gazeX": round(safe_px * 2 / width, 6), "gazeY": 0.002}
    (output / "eye_assets.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_dir", type=Path)
    args = parser.parse_args()
    print(json.dumps(derive(args.task_dir), indent=2))


if __name__ == "__main__":
    main()
