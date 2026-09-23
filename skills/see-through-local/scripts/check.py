"""Read-only preflight and output audit for the local see-through skill."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image


PROJECT = Path(__file__).resolve().parents[3]
OUT_ROOT = PROJECT / "outputs" / "seethrough_local"
EXPECTED = (
    "topwear", "legwear", "handwear", "backhair", "footwear", "earwear",
    "neck", "bottomwear", "eyebrow", "ears", "face", "nose", "mouth",
    "eyelash", "eyewhite", "irides", "fronthair",
)


def finding(level: str, code: str, detail: str) -> dict:
    return {"level": level, "code": code, "detail": detail}


def preflight(source: Path) -> dict:
    issues = []
    if Path.cwd().resolve() != PROJECT.resolve():
        issues.append(finding("block", "wrong_worktree", f"Run from {PROJECT}; current directory is {Path.cwd().resolve()}"))
    if not source.is_file():
        issues.append(finding("block", "missing_input", str(source)))
    else:
        try:
            with Image.open(source) as im:
                im.verify()
            with Image.open(source) as im:
                width, height = im.size
                if min(width, height) < 1024:
                    issues.append(finding("review", "small_source", f"Input is {width}x{height}; fine facial detail may not survive 1280px layer extraction"))
                if max(width, height) / min(width, height) > 3:
                    issues.append(finding("review", "extreme_aspect", f"Input aspect ratio is {width}:{height}; inspect framing before spending inference time"))
                if im.getexif().get(274, 1) != 1:
                    issues.append(finding("review", "exif_orientation", "Image has EXIF rotation; normalize a new input copy before inference"))
        except Exception as exc:
            issues.append(finding("block", "unreadable_input", str(exc)))
    home_raw = os.environ.get("SEE_THROUGH_HOME")
    if not home_raw:
        issues.append(finding("block", "missing_upstream_home", "Set SEE_THROUGH_HOME to the external see-through checkout"))
    else:
        home = Path(home_raw).expanduser().resolve()
        executable = home / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python")
        for code, path in (
            ("missing_upstream_python", executable),
            ("missing_upstream_inference", home / "inference/scripts/inference_psd.py"),
            ("missing_model_cache", home / "models_hf"),
        ):
            if not path.exists():
                issues.append(finding("block", code, str(path)))
    if not (PROJECT / "dev_psd_write.py").is_file():
        issues.append(finding("block", "missing_psd_writer", "dev_psd_write.py"))
    psd_python = os.environ.get("PSD_PYTHON")
    if psd_python and not Path(psd_python).is_file():
        issues.append(finding("block", "missing_psd_python", psd_python))
    try:
        quality = subprocess.run(
            [sys.executable, str(PROJECT / "quality_contract.py")],
            cwd=PROJECT, capture_output=True, text=True, timeout=60,
        )
        if quality.returncode:
            issues.append(finding("block", "production_contract", (quality.stderr or quality.stdout).strip()[-500:]))
    except (OSError, subprocess.TimeoutExpired) as exc:
        issues.append(finding("block", "production_contract_unavailable", str(exc)))
    if shutil.disk_usage(PROJECT).free < 5 * 1024**3:
        issues.append(finding("review", "low_disk_space", "Less than 5 GiB free; check model staging and output capacity"))
    return {"phase": "preflight", "source": str(source.resolve()), "workspace": str(PROJECT), "issues": issues}


def audit(task: Path) -> dict:
    issues = []
    task = task.resolve()
    if task.parent != OUT_ROOT.resolve():
        issues.append(finding("block", "wrong_task_location", f"Expected a direct child of {OUT_ROOT}: {task}"))
        return {"phase": "audit", "task": str(task), "issues": issues}
    order_path = task / "_order.json"
    if not order_path.is_file():
        issues.append(finding("block", "missing_order", str(order_path)))
        return {"phase": "audit", "task": str(task), "issues": issues}
    try:
        order = json.loads(order_path.read_text(encoding="utf-8"))
        if not isinstance(order, list) or not order:
            raise ValueError("expected a non-empty list")
    except (OSError, ValueError) as exc:
        issues.append(finding("block", "invalid_order", str(exc)))
        return {"phase": "audit", "task": str(task), "issues": issues}
    listed = [entry.get("file") for entry in order if isinstance(entry, dict)]
    if len(listed) != len(order) or len(set(listed)) != len(listed):
        issues.append(finding("block", "duplicate_or_invalid_order", "_order.json must list each layer file exactly once"))
    missing = sorted(set(EXPECTED) - {Path(name).stem for name in listed if isinstance(name, str)})
    if missing:
        issues.append(finding("review", "missing_semantic_layers", ", ".join(missing)))
    baseline = json.loads((PROJECT / "viewer/quality-baseline.json").read_text(encoding="utf-8"))
    resolution = baseline["production"]["inference"]["layerResolution"]
    for name in listed:
        if not isinstance(name, str) or name != Path(name).name or not name.lower().endswith(".png"):
            issues.append(finding("block", "invalid_layer_filename", str(name)))
            continue
        path = task / name
        if not path.is_file():
            issues.append(finding("block", "missing_layer", name))
            continue
        try:
            with Image.open(path) as im:
                if im.mode != "RGBA" or im.size != (resolution, resolution):
                    issues.append(finding("block", "invalid_layer_format", f"{name}: {im.mode} {im.size}, expected RGBA {resolution}x{resolution}"))
                if im.mode == "RGBA" and im.getchannel("A").getbbox() is None:
                    issues.append(finding("review", "empty_layer", name))
        except (OSError, ValueError) as exc:
            issues.append(finding("block", "unreadable_layer", f"{name}: {exc}"))
    report_path = task / "_alpha_validation.json"
    if not report_path.is_file():
        issues.append(finding("block", "missing_alpha_report", str(report_path)))
    else:
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
            report_layers = report.get("layers", {})
            if not isinstance(report_layers, dict):
                issues.append(finding("block", "invalid_alpha_layers", "Alpha report layers must be an object"))
            else:
                for name in listed:
                    if isinstance(name, str) and Path(name).stem not in report_layers:
                        issues.append(finding("block", "missing_alpha_layer_entry", name))
            for layer in report.get("manual_review", []):
                issues.append(finding("review", "alpha_manual_review", str(layer)))
            if report.get("summary", {}).get("deliverable") is not True and not report.get("manual_review"):
                issues.append(finding("review", "alpha_not_deliverable", "Alpha report does not mark this task deliverable"))
        except (OSError, ValueError) as exc:
            issues.append(finding("block", "invalid_alpha_report", str(exc)))
    if not (task / "_alpha_checkerboard.png").is_file():
        issues.append(finding("block", "missing_checkerboard", "_alpha_checkerboard.png"))
    preview_dir = task / "_previews"
    if not preview_dir.is_dir() or any(isinstance(name, str) and not (preview_dir / name).is_file() for name in listed):
        issues.append(finding("block", "missing_layer_previews", "_previews must contain one checkerboard thumbnail per ordered layer"))
    psds = list(task.glob("*_clean.psd"))
    if len(psds) != 1:
        issues.append(finding("block", "missing_or_ambiguous_psd", f"Expected one clean PSD; found {len(psds)}"))
    else:
        with psds[0].open("rb") as stream:
            if stream.read(4) != b"8BPS":
                issues.append(finding("block", "invalid_psd_header", psds[0].name))
    try:
        quality = subprocess.run(
            [sys.executable, str(PROJECT / "quality_contract.py"), "--task", str(task)],
            cwd=PROJECT, capture_output=True, text=True, timeout=90,
        )
        if quality.returncode:
            issues.append(finding("block", "production_contract", (quality.stderr or quality.stdout).strip()[-500:]))
    except (OSError, subprocess.TimeoutExpired) as exc:
        issues.append(finding("block", "production_contract_unavailable", str(exc)))
    return {"phase": "audit", "task": str(task), "layer_count": len(listed), "issues": issues}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="phase", required=True)
    sub.add_parser("preflight").add_argument("source", type=Path)
    sub.add_parser("audit").add_argument("task", type=Path)
    args = parser.parse_args()
    result = preflight(args.source) if args.phase == "preflight" else audit(args.task)
    issues = result["issues"]
    result["status"] = "blocked" if any(item["level"] == "block" for item in issues) else "review" if issues else "machine_pass"
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return {"machine_pass": 0, "blocked": 1, "review": 2}[result["status"]]


if __name__ == "__main__":
    raise SystemExit(main())
