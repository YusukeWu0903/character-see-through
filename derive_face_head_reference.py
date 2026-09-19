"""Build a face-only drawing base from validated semantic see-through layers.

The result deliberately omits front/back hair. It is the only valid canvas for
expression artwork: hair stays a separate, top-most renderer layer.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

HEAD_ORDER = ("ears", "earwear", "face", "nose", "mouth", "eyewhite", "irides", "eyelash", "eyebrow")
EXCLUDED_HAIR = ("backhair", "fronthair")


def derive(task_dir: Path) -> dict:
    task_dir = task_dir.resolve()
    images = {name: Image.open(task_dir / f"{name}.png").convert("RGBA") for name in HEAD_ORDER}
    sizes = {image.size for image in images.values()}
    if len(sizes) != 1:
        raise ValueError("head-layer canvas sizes differ")
    canvas = Image.new("RGBA", sizes.pop())
    for name in HEAD_ORDER:
        canvas.alpha_composite(images[name])
    candidates = task_dir / "_rig_candidates"
    candidates.mkdir(exist_ok=True)
    output = candidates / "head_base_open.png"
    canvas.save(output)
    report = {"schemaVersion": 1, "file": output.name, "canvas": list(canvas.size), "order": list(HEAD_ORDER), "excluded": list(EXCLUDED_HAIR), "purpose": "expression artwork base; hair is composited separately by the viewer"}
    (candidates / "head_base_manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_dir", type=Path)
    args = parser.parse_args()
    print(json.dumps(derive(args.task_dir), indent=2))


if __name__ == "__main__":
    main()
