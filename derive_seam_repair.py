"""Create a narrowly masked torso seam-repair candidate from the source image.

The original illustration is registered to the validated local composite with
SIFT/RANSAC.  Only the neck joint and the inner upper-arm joint bands are
copied into a full-canvas RGBA overlay.  This avoids colour-threshold erasure
and keeps every existing semantic layer untouched.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from derive_eye_assets import components

VIEW_ORDER = ["handwear", "legwear", "topwear", "backhair", "footwear", "earwear", "neck", "bottomwear", "eyebrow", "ears", "face", "nose", "mouth", "eyelash", "eyewhite", "irides", "fronthair"]


def _composite(task: Path, order: list[str]) -> Image.Image:
    canvas = Image.new("RGBA", Image.open(task / "face.png").size, (255, 255, 255, 255))
    for name in order:
        canvas.alpha_composite(Image.open(task / f"{name}.png").convert("RGBA"))
    return canvas


def _register(source: np.ndarray, target: np.ndarray) -> tuple[np.ndarray, dict]:
    sift = cv2.SIFT_create()
    key_a, desc_a = sift.detectAndCompute(cv2.cvtColor(source, cv2.COLOR_RGB2GRAY), None)
    key_b, desc_b = sift.detectAndCompute(cv2.cvtColor(target, cv2.COLOR_RGB2GRAY), None)
    pairs = cv2.BFMatcher().knnMatch(desc_a, desc_b, k=2)
    good = [pair[0] for pair in pairs if len(pair) == 2 and pair[0].distance < .7 * pair[1].distance]
    if len(good) < 30:
        raise ValueError("not enough source/local feature matches")
    before = np.float32([key_a[match.queryIdx].pt for match in good])
    after = np.float32([key_b[match.trainIdx].pt for match in good])
    matrix, inliers = cv2.estimateAffinePartial2D(before, after, method=cv2.RANSAC, ransacReprojThreshold=3)
    count = int(inliers.sum()) if inliers is not None else 0
    scale = float(np.hypot(matrix[0, 0], matrix[1, 0])) if matrix is not None else 0
    if matrix is None or count < 30 or not .65 <= scale <= 1.25 or abs(float(matrix[0, 1])) > .08:
        raise ValueError("unreliable source/local registration")
    warped = cv2.warpAffine(source, matrix, (target.shape[1], target.shape[0]), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    return warped, {"matrix": matrix.tolist(), "matches": len(good), "inliers": count, "scale": scale}


def _masks(task: Path, size: tuple[int, int]) -> tuple[dict[str, Image.Image], dict]:
    arm = Image.open(task / "handwear.png").convert("RGBA").getchannel("A")
    neck = Image.open(task / "neck.png").convert("RGBA").getchannel("A")
    body_alpha = np.maximum.reduce([np.asarray(Image.open(task / f"{name}.png").convert("RGBA").getchannel("A")) for name in ("handwear", "neck", "topwear", "face")])
    parts = sorted(components(arm, min_pixels=100), key=lambda part: part["bbox"][0])
    neck_parts = components(neck, min_pixels=100)
    if len(parts) != 2 or not neck_parts:
        raise ValueError("expected two arms and one neck")
    torso_mask = Image.new("L", size)
    torso_draw = ImageDraw.Draw(torso_mask)
    head_mask = Image.new("L", size)
    head_draw = ImageDraw.Draw(head_mask)
    regions = []
    for side, part in zip(("screen_left_shoulder", "screen_right_shoulder"), parts):
        x0, y0, x1, y1 = part["bbox"]
        if x0 < size[0] / 2:
            box = [x1 - 46, y0 - 10, x1 + 16, min(y0 + 120, y1)]
        else:
            box = [x0 - 16, y0 - 10, x0 + 46, min(y0 + 120, y1)]
        box = [max(0, box[0]), max(0, box[1]), min(size[0], box[2]), min(size[1], box[3])]
        torso_draw.rounded_rectangle(box, radius=10, fill=255)
        regions.append({"name": side, "bbox": box})
    x0, y0, x1, y1 = neck_parts[0]["bbox"]
    face_bottom = components(Image.open(task / "face.png").convert("RGBA").getchannel("A"), min_pixels=100)[0]["bbox"][3]
    neck_box = [max(0, x0 - 8), max(0, y0 - 8), min(size[0], x1 + 8), min(size[1], y1 + 14)]
    # Do not let an image patch cross the head/torso bone boundary.  That was
    # the cause of the rigid-preview face tear in seams_v1.
    head_box = [neck_box[0], neck_box[1], neck_box[2], min(neck_box[3], face_bottom)]
    torso_box = [neck_box[0], max(neck_box[1], face_bottom), neck_box[2], neck_box[3]]
    head_draw.rounded_rectangle(head_box, radius=7, fill=255)
    torso_draw.rounded_rectangle(torso_box, radius=7, fill=255)
    regions.extend([{"name": "neck_head", "bbox": head_box}, {"name": "neck_torso", "bbox": torso_box}])
    masks = {}
    for name, raw in (("seam_repair_head", head_mask), ("seam_repair_torso", torso_mask)):
        alpha = np.minimum(np.asarray(raw.filter(ImageFilter.GaussianBlur(2))), body_alpha)
        masks[name] = Image.fromarray(alpha.astype(np.uint8))
    return masks, {"regions": regions, "pixels": {name: int((np.asarray(mask) > 8).sum()) for name, mask in masks.items()}}


def derive(task_dir: Path, source_path: Path, version: str) -> Path:
    task = task_dir.resolve()
    if not version.replace("_", "").replace("-", "").isalnum():
        raise ValueError("unsafe version")
    destination = task / "_rig_candidates" / version
    destination.mkdir(exist_ok=False)
    local = np.asarray(_composite(task, VIEW_ORDER).convert("RGB"))
    source = np.asarray(Image.open(source_path).convert("RGB"))
    aligned, registration = _register(source, local)
    masks, coverage = _masks(task, (local.shape[1], local.shape[0]))
    repairs = []
    for name, mask in masks.items():
        rgba = np.dstack([aligned, np.asarray(mask)])
        rgba[rgba[:, :, 3] == 0, :3] = 0
        repair = Image.fromarray(rgba)
        repair.save(destination / f"{name}.png")
        repairs.append(repair)
    before = Image.fromarray(local)
    after = before.convert("RGBA")
    for repair in repairs: after.alpha_composite(repair)
    after = after.convert("RGB")
    crop = (450, 150, 830, 390)
    strip = Image.new("RGB", (760, 240))
    strip.paste(before.crop(crop), (0, 0)); strip.paste(after.crop(crop), (380, 0))
    draw = ImageDraw.Draw(strip); draw.text((8, 8), "before", fill="white"); draw.text((388, 8), "seam repair candidate", fill="white")
    strip.save(destination / "review_before_after.png")
    report = {"schemaVersion": 2, "source": "registered_original", "registration": registration, "coverage": coverage, "status": "candidate", "files": ["seam_repair_head.png", "seam_repair_torso.png", "review_before_after.png"]}
    (destination / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("task_dir", type=Path); parser.add_argument("source_path", type=Path); parser.add_argument("--version", required=True)
    args = parser.parse_args(); print(derive(args.task_dir, args.source_path, args.version))
