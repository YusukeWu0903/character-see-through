#!/usr/bin/env python3
"""Read-only structural audit for a candidate assembly manifest.

Usage: python skills/character-assembly-repair/scripts/check.py TASK_DIR MANIFEST
This checks ownership, compositing constraints, and declared alpha-only repairs,
never visual quality.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def audit(task_dir: Path, manifest_path: Path, repo_root: Path) -> list[str]:
    problems: list[str] = []
    task_dir = task_dir.resolve()
    manifest_path = manifest_path.resolve()
    repo_root = repo_root.resolve()
    output_root = repo_root / "outputs" / "seethrough_local"
    if not task_dir.is_relative_to(output_root) or not task_dir.is_dir():
        return ["task must be an existing outputs/seethrough_local child"]
    if not manifest_path.is_relative_to(task_dir / "_review"):
        return ["manifest must be under the task's _review directory"]
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        original = json.loads((task_dir / "_order.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return [f"cannot read manifest or original order: {exc}"]
    if not isinstance(manifest, dict) or not isinstance(original, list):
        return ["manifest must be an object and original order must be a list"]
    if manifest.get("schemaVersion") != 1 or manifest.get("task") != task_dir.name:
        problems.append("schema version or task identity does not match")
    if manifest.get("nonProduction") is not True or manifest.get("reviewStatus") not in {"pending", "accepted"}:
        problems.append("candidate production/review state is invalid")
    source = manifest.get("source")
    if not isinstance(source, str) or not source or Path(source).is_absolute():
        problems.append("source must be a repository-relative file")
    else:
        source_path = (repo_root / source).resolve()
        if not source_path.is_relative_to(repo_root) or not source_path.is_file():
            problems.append("source is outside repository or missing")
        elif hashlib.sha256(source_path.read_bytes()).hexdigest().lower() != str(manifest.get("sourceSha256", "")).lower():
            problems.append("source SHA-256 does not match")
    entries = manifest.get("drawOrder")
    if not isinstance(entries, list) or not entries:
        return problems + ["drawOrder must be a nonempty list"]
    if any(not isinstance(entry, dict) for entry in entries):
        return problems + ["each drawOrder entry must be an object"]
    files = [entry.get("file") for entry in entries]
    expected = [entry.get("file") for entry in original if isinstance(entry, dict)]
    if len(files) != len(set(files)) or set(files) != set(expected):
        problems.append("drawOrder must contain each original layer exactly once")
    for entry in entries:
        name = entry.get("file")
        if not isinstance(name, str) or Path(name).name != name or not name.endswith(".png"):
            problems.append(f"invalid layer filename: {name}")
        elif not (task_dir / name).is_file():
            problems.append(f"missing layer PNG: {name}")
        asset = entry.get("asset", name)
        if not isinstance(asset, str) or not asset.endswith(".png"):
            problems.append(f"{name}: invalid candidate asset")
        else:
            asset_path = (task_dir / asset).resolve()
            if not asset_path.is_relative_to(task_dir) or not asset_path.is_file():
                problems.append(f"{name}: candidate asset missing or outside task")
        for field in ("label", "group", "parent"):
            if not isinstance(entry.get(field), str) or not entry[field].strip():
                problems.append(f"{name}: missing {field}")
    repairs = manifest.get("alphaOnlyRepairs", [])
    if not isinstance(repairs, list):
        problems.append("alphaOnlyRepairs must be a list")
    elif repairs:
        import numpy as np
        from PIL import Image

        by_file = {entry.get("file"): entry for entry in entries}
        for item in repairs:
            if not isinstance(item, dict):
                problems.append("invalid alphaOnlyRepairs entry")
                continue
            name, underlay = item.get("file"), item.get("underlay")
            bounds = item.get("allowedBounds")
            threshold = item.get("minUnderlayAlpha", 0)
            if (name not in by_file or underlay not in expected
                    or not isinstance(bounds, list) or len(bounds) != 4
                    or not all(isinstance(v, int) for v in bounds)
                    or not isinstance(threshold, int) or not 0 <= threshold <= 255):
                problems.append(f"invalid alpha repair declaration: {name}")
                continue
            original_path = task_dir / name
            candidate_path = task_dir / by_file[name].get("asset", name)
            underlay_path = task_dir / underlay
            if not all(p.is_file() for p in (original_path, candidate_path, underlay_path)):
                problems.append(f"{name}: alpha repair asset missing")
                continue
            with Image.open(original_path) as original_img, Image.open(candidate_path) as candidate_img, Image.open(underlay_path) as underlay_img:
                original = np.asarray(original_img.convert("RGBA"))
                candidate = np.asarray(candidate_img.convert("RGBA"))
                beneath = np.asarray(underlay_img.convert("RGBA"))
            if original.shape != candidate.shape or candidate.shape != beneath.shape:
                problems.append(f"{name}: alpha repair canvas mismatch")
                continue
            if not np.array_equal(original[:, :, :3], candidate[:, :, :3]):
                problems.append(f"{name}: alpha-only repair changed RGB")
            if np.any(candidate[:, :, 3] > original[:, :, 3]):
                problems.append(f"{name}: alpha-only repair increased alpha")
            changed = candidate[:, :, 3] < original[:, :, 3]
            if not np.any(changed):
                problems.append(f"{name}: declared alpha-only repair changed no pixels")
                continue
            ys, xs = np.where(changed)
            if (xs.min() < bounds[0] or ys.min() < bounds[1]
                    or xs.max() > bounds[2] or ys.max() > bounds[3]):
                problems.append(f"{name}: alpha repair escaped allowed bounds")
            if np.any(beneath[:, :, 3][changed] < threshold):
                problems.append(f"{name}: alpha repair exposes insufficient underlay")
    constraints = manifest.get("constraints")
    if not isinstance(constraints, list) or not constraints:
        problems.append("candidate needs explicit draw-order constraints")
    else:
        position = {name: index for index, name in enumerate(files)}
        for item in constraints:
            if not isinstance(item, dict):
                problems.append("invalid constraint")
                continue
            back, front = item.get("behind"), item.get("inFrontOf")
            if back not in position or front not in position or position[back] >= position[front]:
                problems.append(f"order violation: {back} must be behind {front}")
            if not isinstance(item.get("reason"), str) or not item["reason"].strip():
                problems.append(f"constraint {back}/{front} needs a reason")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_dir", type=Path)
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[3]
    problems = audit(args.task_dir, args.manifest, repo_root)
    if problems:
        print("blocked: assembly manifest structural audit")
        for problem in problems:
            print(f"- {problem}")
        return 1
    print("machine_pass: assembly structure/order and declared pixel invariants only; visual repair remains pending")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
