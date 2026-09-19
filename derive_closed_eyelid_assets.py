"""Create replaceable closed-eyelid layers from an existing eyelash layer.

This is deliberately a conservative fallback, not a claim that an AI-generated
eyelid is artist-ready.  Each output is a full-canvas RGBA layer with only one
compressed lash arc.  A future hand-painted or locally inpainted eyelid can
replace the PNG without changing the viewer contract.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

from derive_eye_assets import components


def derive(task_dir: Path) -> dict:
    task_dir = task_dir.resolve()
    output = task_dir / "_rig_assets"
    eye_report = json.loads((output / "eye_assets.json").read_text(encoding="utf-8"))
    eyelash = Image.open(task_dir / "eyelash.png").convert("RGBA")
    parts = sorted(components(eyelash.getchannel("A"))[:2], key=lambda part: part["bbox"][0])
    if len(parts) != 2:
        raise ValueError(f"eyelash needs exactly two significant regions; found {len(parts)}")
    result = {"schemaVersion": 1, "source": "compressed_existing_eyelash", "layers": {}}
    for side, part in zip(("left", "right"), parts):
        x0, y0, x1, y1 = part["bbox"]
        crop = eyelash.crop((x0, y0, x1, y1))
        target_height = max(3, round((y1 - y0) * 0.24))
        closed = crop.resize((x1 - x0, target_height), Image.Resampling.LANCZOS)
        eye = eye_report["layers"]["irides"][side]["bbox"]
        center_y = round((eye[1] + eye[3]) / 2)
        layer = Image.new("RGBA", eyelash.size)
        layer.alpha_composite(closed, (x0, center_y - target_height // 2))
        filename = f"eyelid_closed_{side}.png"
        layer.save(output / filename)
        result["layers"][side] = {"sourceBbox": part["bbox"], "closedHeight": target_height, "centerY": center_y, "file": filename}
    eye_report["closedEyelids"] = result
    (output / "eye_assets.json").write_text(json.dumps(eye_report, indent=2), encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_dir", type=Path)
    print(json.dumps(derive(parser.parse_args().task_dir), indent=2))


if __name__ == "__main__":
    main()
