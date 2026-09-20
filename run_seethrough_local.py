"""Run local see-through and export independently verified RGBA layers.

The upstream PSD route is deliberately never used: LayerDiff may bake a neutral
grey plate into a part PNG, so cleanup happens before both PNG and PSD delivery.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from quality_contract import load_quality_baseline

ST_HOME_RAW = os.environ.get("SEE_THROUGH_HOME")
ST_HOME = Path(ST_HOME_RAW).expanduser() if ST_HOME_RAW else None
ST_PY = ST_HOME / ".venv" / "Scripts" / "python.exe" if ST_HOME else None
ST_SCRIPT = ST_HOME / "inference" / "scripts" / "inference_psd.py" if ST_HOME else None
HF_HOME = ST_HOME / "models_hf" if ST_HOME else None
PROJECT = Path(__file__).resolve().parent
OUT_ROOT = PROJECT / "outputs" / "seethrough_local"
STAGING_ROOT = OUT_ROOT / "_staging"
PSD_PYTHON = os.environ.get("PSD_PYTHON")
PSD_WRITER = PROJECT / "dev_psd_write.py"
CANON = ["topwear", "legwear", "handwear", "back hair", "footwear", "earwear",
         "neck", "bottomwear", "eyebrow", "ears", "face", "nose", "mouth",
         "eyelash", "eyewhite", "irides", "front hair"]


def safe(name):
    return name.replace(" ", "")


SAFE = {name: safe(name) for name in CANON}
QUALITY_BASELINE = load_quality_baseline()
DEFAULT_LAYER_RESOLUTION = QUALITY_BASELINE["production"]["inference"]["layerResolution"]
DEFAULT_INFERENCE_STEPS = QUALITY_BASELINE["production"]["inference"]["steps"]
DEFAULT_DEPTH_RESOLUTION = QUALITY_BASELINE["production"]["inference"]["depthResolution"]


def _border_mask(shape):
    mask = np.zeros(shape, dtype=bool)
    mask[0, :] = mask[-1, :] = True
    mask[:, 0] = mask[:, -1] = True
    return mask


def _background_model(rgba):
    """Estimate a neutral plate colour only from opaque canvas-edge pixels."""
    rgb = rgba[..., :3].astype(np.int16)
    alpha = rgba[..., 3]
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    value = rgb.mean(axis=2)
    samples = rgb[_border_mask(alpha.shape) & (alpha > 8) & (spread <= 32) &
                  (value >= 100) & (value <= 250)]
    if len(samples) < 8:
        return None
    median = np.median(samples, axis=0)
    distances = np.max(np.abs(samples - median), axis=1)
    return median, max(20, min(48, int(np.percentile(distances, 90)) + 12))


def _background_candidate(rgba, model):
    if model is None:
        return np.zeros(rgba.shape[:2], dtype=bool)
    colour, tolerance = model
    rgb = rgba[..., :3].astype(np.int16)
    alpha = rgba[..., 3]
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    distance = np.max(np.abs(rgb - colour), axis=2)
    return (alpha > 0) & (spread <= 42) & (distance <= tolerance)


def _edge_connected(mask):
    seeds = mask & _border_mask(mask.shape)
    return ndimage.binary_propagation(seeds, mask=mask,
                                      structure=np.ones((3, 3), dtype=bool))


def inspect_rgba(rgba):
    """Measure recognised, opaque background which remains canvas-edge connected."""
    model = _background_model(rgba)
    suspect = _edge_connected(_background_candidate(rgba, model))
    opaque = int((rgba[..., 3] > 0).sum())
    count = int(suspect.sum())
    return {
        "opaque_pixels": opaque,
        "edge_connected_background_pixels": count,
        "edge_connected_background_percent": round(100 * count / max(1, opaque), 4),
        "background_model": None if model is None else {
            "rgb": [int(x) for x in model[0]], "tolerance": int(model[1])},
    }


def clean_layer_rgba(rgba, reference_rgba=None):
    """Clear only neutral candidates connected to the canvas boundary.

    This intentionally preserves an isolated grey shirt, shadow, or accessory:
    it may have a similar colour, but it has no candidate path to the boundary.
    """
    before = inspect_rgba(rgba)
    candidate = _background_candidate(rgba, _background_model(rgba))
    # Do not let a source-matching grey detail become a bridge between the
    # edge plate and the real character.
    if reference_rgba is not None and reference_rgba.shape == rgba.shape:
        rgb = rgba[..., :3].astype(np.int16)
        ref_rgb = reference_rgba[..., :3].astype(np.int16)
        candidate &= np.max(np.abs(rgb - ref_rgb), axis=2) > 45
    remove = _edge_connected(candidate)
    cleaned = rgba.copy()
    cleaned[..., 3][remove] = 0
    # Do not remove pixels merely because their colour differs from src_img.
    # LayerDiff deliberately inpaints occluded areas, so that comparison would
    # erase valid painted detail and create seams (especially around the face).
    # The reference is used only to prevent source-matching details from forming
    # a bridge to a confirmed edge-connected plate above.
    source_removed = 0
    after = inspect_rgba(cleaned)
    return cleaned, {"before": before, "after": after,
                     "removed_pixels": int(remove.sum()) + source_removed,
                     "edge_removed_pixels": int(remove.sum()),
                     "source_mismatch_removed_pixels": source_removed}


def _checker_preview(rgba, tile=20):
    h, w = rgba.shape[:2]
    yy, xx = np.indices((h, w))
    checker = np.where(((xx // tile) + (yy // tile)) % 2, 205, 238).astype(np.uint8)
    base = np.dstack((checker, checker, checker, np.full((h, w), 255, np.uint8)))
    return np.asarray(Image.alpha_composite(Image.fromarray(base, "RGBA"), Image.fromarray(rgba, "RGBA")))


def write_previews(out, entries, report):
    preview_dir = out / "_previews"
    preview_dir.mkdir(exist_ok=True)
    thumbs = []
    for entry in entries:
        rgba = np.asarray(Image.open(out / entry["file"]).convert("RGBA"))
        preview = Image.fromarray(_checker_preview(rgba), "RGBA")
        preview.thumbnail((320, 320), Image.Resampling.LANCZOS)
        preview.save(preview_dir / entry["file"])
        thumbs.append((entry["name"], preview))
    cell_w, cell_h = 340, 370
    sheet = Image.new("RGBA", (cell_w * 3, cell_h * ((len(thumbs) + 2) // 3)), (245, 245, 245, 255))
    draw = ImageDraw.Draw(sheet)
    for i, (name, thumb) in enumerate(thumbs):
        x, y = (i % 3) * cell_w, (i // 3) * cell_h
        sheet.alpha_composite(thumb, (x + (cell_w - thumb.width) // 2, y + 24))
        status = report["layers"][safe(name)]["status"]
        draw.text((x + 8, y + 4), f"{name}: {status}",
                  fill=(180, 35, 35) if status == "manual-review" else (20, 100, 45))
    sheet.save(out / "_alpha_checkerboard.png")


def cleanup_layers(out, reference_path=None):
    """Clean ordered PNGs and produce auditable before/after alpha measurements."""
    order = json.loads((out / "_order.json").read_text(encoding="utf-8"))
    report = {"algorithm": "neutral colour learned at canvas edge; remove only edge-connected candidates; never globally erase source-mismatching pixels",
              "layers": {}, "manual_review": []}
    reference_rgba = None
    if reference_path and Path(reference_path).exists():
        reference_rgba = np.asarray(Image.open(reference_path).convert("RGBA")).copy()
    for entry in order:
        path = out / entry["file"]
        cleaned, stats = clean_layer_rgba(np.asarray(Image.open(path).convert("RGBA")).copy(), reference_rgba)
        Image.fromarray(cleaned, "RGBA").save(path)
        status = "pass" if stats["after"]["edge_connected_background_pixels"] == 0 else "manual-review"
        stats["status"] = status
        report["layers"][safe(entry["name"])] = stats
        if status == "manual-review":
            report["manual_review"].append(entry["name"])
    # A nearly-empty footwear layer on a full-body character is a model quality
    # failure (typically leaves legwear cut off at the ankle), not an Alpha pass.
    # Keep it visible in the output, but never label such a result as deliverable.
    for required, minimum_pixels in {"legwear": 1000, "footwear": 1000}.items():
        key = safe(required)
        layer = report["layers"].get(key)
        if layer and layer["after"]["opaque_pixels"] < minimum_pixels:
            layer["status"] = "manual-review"
            layer["quality_issue"] = f"{required} alpha coverage too small ({layer['after']['opaque_pixels']}px < {minimum_pixels}px)"
            if required not in report["manual_review"]:
                report["manual_review"].append(required)
    report["summary"] = {"removed_pixels": sum(v["removed_pixels"] for v in report["layers"].values()),
                         "layers_requiring_manual_review": report["manual_review"],
                         "deliverable": not report["manual_review"]}
    (out / "_alpha_validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_previews(out, order, report)
    print(f"  清理灰底合計: {report['summary']['removed_pixels']}px")
    if report["manual_review"]:
        print("  !! 需人工檢查:", ", ".join(report["manual_review"]))
    return report


def copy_clean_layers(workdir, out):
    out.mkdir(parents=True, exist_ok=False)
    entries = []
    for tag in CANON:
        src = workdir / f"{tag}.png"
        if not src.exists():
            print(f"  跳過 {tag} (無此層)")
            continue
        shutil.copy2(src, out / f"{SAFE[tag]}.png")
        entries.append({"name": tag, "file": f"{SAFE[tag]}.png"})
    if not entries:
        raise RuntimeError(f"沒有在 {workdir} 找到任何預期圖層")
    (out / "_order.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  已複製 {len(entries)} 層")
    return entries


def write_clean_psd(out, psd_out, h, w):
    python = Path(PSD_PYTHON) if PSD_PYTHON else Path(sys.executable)
    result = subprocess.run([str(python), str(PSD_WRITER), "--dir", str(out),
                             "--order", str(out / "_order.json"), "--out", str(psd_out),
                             "--h", str(h), "--w", str(w)], capture_output=True, text=True, timeout=300)
    print(result.stdout[-800:])
    if result.returncode:
        raise RuntimeError(f"PSD 寫入失敗:\n{result.stderr[-1000:]}")


def task_directory(src):
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", src.stem).strip("._") or "sprite"
    base = OUT_ROOT / f"{stem}_{datetime.now():%Y%m%d_%H%M%S}"
    candidate, index = base, 2
    while candidate.exists():
        candidate = OUT_ROOT / f"{base.name}_{index}"
        index += 1
    return candidate


def main():
    ap = argparse.ArgumentParser(description="本機 see-through 拆層 (驗證 RGBA PNG + PSD)")
    ap.add_argument("src")
    # Match the upstream quality defaults.  The head is a second inference
    # stage, so reducing these values materially damages facial boundaries.
    ap.add_argument("--resolution", type=int, default=DEFAULT_LAYER_RESOLUTION)
    ap.add_argument("--steps", type=int, default=DEFAULT_INFERENCE_STEPS)
    ap.add_argument("--depth-h", type=int, default=DEFAULT_DEPTH_RESOLUTION)
    args = ap.parse_args()
    src = Path(args.src)
    if not src.exists():
        print(f"!! 找不到圖: {src}"); sys.exit(1)
    if ST_HOME is None:
        print("!! 請設定 SEE_THROUGH_HOME 指向 see-through checkout"); sys.exit(1)
    if not ST_PY.exists():
        print("!! see-through venv 不存在, 先完成安裝"); sys.exit(1)
    # The upstream program names its workspace solely from the input filename.
    # Feed it a unique staged copy, otherwise two runs of the same character can
    # race over workspace/layerdiff_output/<original-stem> and contaminate one
    # another (or fail if a preview process still has src_img.png open).
    out = task_directory(src)
    STAGING_ROOT.mkdir(parents=True, exist_ok=True)
    staged_src = STAGING_ROOT / f"{out.name}{src.suffix.lower()}"
    shutil.copy2(src, staged_src)
    print(f"[1/3] 執行 see-through 拆層 ... ({args.steps} 步)")
    # This project keeps the pinned model snapshots locally.  Offline mode
    # prevents Hugging Face from performing a metadata HEAD request for an
    # optional safetensors index on every run; that request can fail on locked
    # down Windows networks even though all required weights are already cached.
    env = dict(os.environ, HF_HOME=str(HF_HOME), HF_HUB_OFFLINE="1")
    command = [str(ST_PY), str(ST_SCRIPT), "--srcp", str(staged_src.resolve()), "--resolution", str(args.resolution),
               "--resolution_depth", str(args.depth_h), "--inference_steps", str(args.steps),
               "--group_offload", "--disable_progressbar"]
    if subprocess.run(command, cwd=str(ST_HOME), env=env).returncode:
        print("!! see-through 失敗"); sys.exit(2)
    workdir = ST_HOME / "workspace" / "layerdiff_output" / staged_src.stem
    if not workdir.is_dir():
        print(f"!! 找不到原始層目錄: {workdir}"); sys.exit(3)
    print(f"[2/3] 匯出隔離任務: {out}")
    copy_clean_layers(workdir, out)
    cleanup_layers(out, workdir / "src_img.png")
    write_clean_psd(out, out / f"{src.stem}_clean.psd", args.resolution, args.resolution)
    print(f"[3/3] 完成! 輸出目錄: {out}")
    print("     驗證報告: _alpha_validation.json；棋盤格: _alpha_checkerboard.png")
    print(f"     對照 viewer: http://127.0.0.1:8010/preview?local={out.name}")


if __name__ == "__main__":
    main()
