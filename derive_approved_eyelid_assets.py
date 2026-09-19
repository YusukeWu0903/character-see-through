"""Turn a user-approved closed-eye reference into aligned RGBA rig layers.

Only the difference inside the two measured source-eye regions is retained.
The reference never replaces the character image wholesale; it supplies the
closed-eye paint that is composited onto the existing see-through canvas.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

from derive_eye_assets import components


def _eye_boxes(image: Image.Image) -> list[list[int]]:
    width, height = image.size
    crop_x0, crop_y0, crop_x1, crop_y1 = round(width * 0.35), round(height * 0.08), round(width * 0.65), round(height * 0.20)
    grayscale = image.convert("L").crop((crop_x0, crop_y0, crop_x1, crop_y1))
    dark = grayscale.point(lambda value: 255 if value < 105 else 0)
    found = components(dark, threshold=8, min_pixels=max(30, width // 7))[:2]
    if len(found) != 2:
        raise ValueError(f"could not locate two source eye regions; found {len(found)}")
    return sorted([[box["bbox"][0] + crop_x0, box["bbox"][1] + crop_y0, box["bbox"][2] + crop_x0, box["bbox"][3] + crop_y0] for box in found], key=lambda box: box[0])


def _expand(box: list[int], size: tuple[int, int], horizontal: int = 7, vertical: int = 9) -> tuple[int, int, int, int]:
    width, height = size
    return max(0, box[0] - horizontal), max(0, box[1] - vertical), min(width, box[2] + horizontal), min(height, box[3] + vertical)


def derive(task_dir: Path, source_path: Path, reference_path: Path | None = None) -> dict:
    task_dir = task_dir.resolve()
    source = Image.open(source_path).convert("RGBA")
    reference_path = reference_path or task_dir / "_rig_candidates" / "closed_eye_reference.png"
    reference = Image.open(reference_path).convert("RGBA")
    if reference.size != source.size:
        raise ValueError("approved closed-eye reference must preserve source canvas dimensions")
    output = task_dir / "_rig_assets"
    report = json.loads((output / "eye_assets.json").read_text(encoding="utf-8"))
    eyelash = Image.open(task_dir / "eyelash.png").convert("RGBA")
    targets = sorted(components(eyelash.getchannel("A"))[:2], key=lambda part: part["bbox"][0])
    sources = _eye_boxes(source)
    if len(targets) != 2:
        raise ValueError("task eyelash layer needs exactly two significant eye regions")
    layers = {}
    for side, source_box, target in zip(("left", "right"), sources, targets):
        region = _expand(source_box, source.size)
        before = source.crop(region)
        after = reference.crop(region)
        difference = ImageChops.difference(before.convert("RGB"), after.convert("RGB")).convert("L")
        mask = difference.point(lambda value: 255 if value > 10 else 0).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.65))
        patch = after.copy()
        patch.putalpha(mask)
        x0, y0, x1, y1 = target["bbox"]
        patch = patch.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
        layer = Image.new("RGBA", eyelash.size)
        layer.alpha_composite(patch, (x0, y0))
        filename = f"eyelid_closed_{side}.png"
        layer.save(output / filename)
        layers[side] = {"file": filename, "sourceRegion": list(region), "targetBbox": target["bbox"], "alphaPixels": sum(alpha > 8 for alpha in layer.getchannel("A").getdata())}
    report["closedEyelids"] = {"schemaVersion": 1, "source": "approved_artwork", "reference": Path(reference_path).name, "layers": layers}
    (output / "eye_assets.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report["closedEyelids"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_dir", type=Path)
    parser.add_argument("source_path", type=Path)
    parser.add_argument("--reference", type=Path)
    args = parser.parse_args()
    print(json.dumps(derive(args.task_dir, args.source_path, args.reference), indent=2))


if __name__ == "__main__":
    main()
