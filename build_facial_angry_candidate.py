"""Build Eris's opt-in angry-expression candidate from the user's hairless sheet."""
from __future__ import annotations
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
TASK = ROOT / "outputs/seethrough_local/Eris_full_body_casual_20260918_113905"
SOURCE = ROOT / "emotion_type_bd.jfif"
PARENT = TASK / "_rig_candidates/facial_sheet_v2"
DEST = TASK / "_rig_candidates/facial_angry_v3"
SCALE = 0.43
SOURCE_ANCHOR = (1600, 310)
TARGET_ANCHOR = (640, 158)
CANVAS = (1280, 1280)

def place(pixels: Image.Image, offset: tuple[int, int] = (0, 0)) -> Image.Image:
    source = pixels
    resized = pixels.resize((round(source.width * SCALE),
                             round(source.height * SCALE)), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", CANVAS)
    output.paste(resized, (round(TARGET_ANCHOR[0] - SOURCE_ANCHOR[0] * SCALE) + offset[0],
                           round(TARGET_ANCHOR[1] - SOURCE_ANCHOR[1] * SCALE) + offset[1]))
    return output

def transplanted(source: Image.Image, shapes: list[tuple[str, object]]) -> Image.Image:
    mask = Image.new("L", source.size)
    draw = ImageDraw.Draw(mask)
    for kind, points in shapes:
        if kind == "polygon":
            draw.polygon(points, fill=255)
        else:
            draw.ellipse(points, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.1))
    pixels = source.copy()
    pixels.putalpha(mask)
    # Affine bicubic sampling aliases thin brows when shrinking. LANCZOS
    # integrates source pixels before placing them on the target canvas.
    return place(pixels)

def isolated_mouth(source: Image.Image) -> Image.Image:
    """Retain the painted lips, not the source sheet's differently colored skin."""
    mask = Image.new("L", source.size)
    ellipse = Image.new("L", source.size)
    ImageDraw.Draw(ellipse).ellipse((1560, 387, 1640, 410), fill=255)
    source_pixels = source.load()
    mask_pixels = mask.load()
    ellipse_pixels = ellipse.load()
    for x in range(1560, 1641):
        background = tuple(sum(source_pixels[x, y][channel] for y in (383, 385, 387, 407, 409)) / 5
                           for channel in range(3))
        for y in range(387, 411):
            if not ellipse_pixels[x, y]:
                continue
            pixel = source_pixels[x, y]
            darkness = sum(weight * (background[channel] - pixel[channel])
                           for channel, weight in enumerate((0.299, 0.587, 0.114)))
            mask_pixels[x, y] = max(0, min(255, round((darkness - 5) * 255 / 18)))
    pixels = source.copy()
    pixels.putalpha(mask)
    # The painted mouth's dark-pixel midpoint is x=1603, not the face anchor x=1600.
    return place(pixels, offset=(-2, 0))

def main() -> None:
    if not SOURCE.is_file() or not PARENT.is_dir():
        raise FileNotFoundError("Hairless expression sheet or v2 mouth source missing")
    DEST.mkdir(parents=True, exist_ok=True)
    for name in ("neutral", "smile", "slight", "wide", "round", "teeth"):
        shutil.copyfile(PARENT / f"mouth_{name}.png", DEST / f"mouth_{name}.png")
    shutil.copyfile(PARENT / "seam_repair_head_mouthless.png",
                    DEST / "seam_repair_head_mouthless.png")
    source = Image.open(SOURCE).convert("RGBA")
    # Hand-traced ribbons follow the sloped brows and stop above the lashes.
    brows = [
        ("polygon", [(1496, 273), (1515, 274), (1540, 282), (1567, 293),
                     (1591, 300), (1594, 305), (1590, 310), (1570, 305),
                     (1544, 298), (1518, 289), (1496, 285)]),
        ("polygon", [(1606, 300), (1633, 293), (1660, 282), (1685, 274),
                     (1704, 273), (1704, 285), (1682, 289), (1656, 298),
                     (1630, 305), (1610, 310), (1606, 305)]),
        ("polygon", [(1591, 297), (1598, 305), (1594, 314), (1588, 314)]),
        ("polygon", [(1609, 297), (1602, 305), (1606, 314), (1612, 314)]),
    ]
    transplanted(source, brows).save(DEST / "eyebrow_angry.png")
    isolated_mouth(source).save(DEST / "mouth_angry.png")
    report = {
        "schemaVersion": 3,
        "status": "candidate",
        "task": TASK.name,
        "source": "hairless_angry_feature_transplant",
        "referenceSheet": SOURCE.name,
        "referenceSheetSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "emotionSourceCell": "row 1 column 4: 憤怒",
        "registration": {"sourceEyeMidpoint": list(SOURCE_ANCHOR),
                         "targetEyeMidpoint": list(TARGET_ANCHOR),
                         "uniformScale": SCALE},
        "featureScope": ["eyebrow_left", "eyebrow_right", "mouth_angry"],
        "untouchedApprovedFeatures": ["eyewhite", "irides", "eyelash",
                                      "eyelid_closed"],
        "mouthSourceCandidate": "facial_sheet_v2",
        "mouthSkinIsolation": "local source-skin darkness matte; no pasted skin plate",
        "mouthOffsetPixels": [-2, 0],
        "resampling": "LANCZOS area-preserving downscale",
        "visualReview": "pending_user_review",
        "note": "Full angry brow wedge and pressed mouth are source pixels. Eyes/gaze/blink remain approved.",
    }
    (DEST / "report.json").write_text(json.dumps(report, ensure_ascii=False,
                                                indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()