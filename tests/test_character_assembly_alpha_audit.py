"""Behavioral checks for declared alpha-only seam repairs."""

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "assembly_check", REPO / "skills/character-assembly-repair/scripts/check.py"
)
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class AlphaRepairAuditTest(unittest.TestCase):
    def setUp(self):
        output = REPO / "outputs/seethrough_local"
        output.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="assembly-audit-", dir=output)
        self.addCleanup(self.temp.cleanup)
        self.task = Path(self.temp.name)
        self.review = self.task / "_review/v1"
        self.review.mkdir(parents=True)
        self.source = self.task / "source.txt"
        self.source.write_text("test source", encoding="utf-8")
        self.original = np.full((4, 4, 4), 255, dtype=np.uint8)
        self.candidate = self.original.copy()
        self.candidate[1, 1, 3] = 0
        self.underlay = self.original.copy()
        self.write_png("topwear.png", self.original)
        self.write_png("_review/v1/topwear.png", self.candidate)
        self.write_png("handwear.png", self.underlay)
        self.write_png("neck.png", self.original)
        order = [{"file": name} for name in ("handwear.png", "topwear.png", "neck.png")]
        (self.task / "_order.json").write_text(json.dumps(order), encoding="utf-8")
        self.manifest = {
            "schemaVersion": 1,
            "task": self.task.name,
            "nonProduction": True,
            "reviewStatus": "pending",
            "source": str(self.source.relative_to(REPO)).replace("\\", "/"),
            "sourceSha256": hashlib.sha256(self.source.read_bytes()).hexdigest(),
            "drawOrder": [
                {"file": name, "label": name, "group": "test", "parent": "torso",
                 **({"asset": "_review/v1/topwear.png"} if name == "topwear.png" else {})}
                for name in ("handwear.png", "topwear.png", "neck.png")
            ],
            "constraints": [{"behind": "handwear.png", "inFrontOf": "topwear.png", "reason": "test"}],
            "alphaOnlyRepairs": [{"file": "topwear.png", "underlay": "handwear.png",
                                  "minUnderlayAlpha": 230, "allowedBounds": [1, 1, 1, 1]}],
        }
        self.manifest_path = self.review / "assembly.json"

    def write_png(self, name, data):
        path = self.task / name
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(data, "RGBA").save(path)

    def audit(self):
        self.manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")
        return CHECK.audit(self.task, self.manifest_path, REPO)

    def test_valid_alpha_repair_passes(self):
        self.assertEqual(self.audit(), [])

    def test_rgb_change_is_blocked(self):
        changed = self.candidate.copy()
        changed[1, 1, 0] = 0
        self.write_png("_review/v1/topwear.png", changed)
        self.assertTrue(any("changed RGB" in p for p in self.audit()))

    def test_alpha_increase_is_blocked(self):
        changed = self.candidate.copy()
        changed[2, 2, 3] = 255
        original = self.original.copy()
        original[2, 2, 3] = 100
        self.write_png("topwear.png", original)
        self.write_png("_review/v1/topwear.png", changed)
        self.assertTrue(any("increased alpha" in p for p in self.audit()))

    def test_missing_underlay_is_blocked(self):
        underlay = self.underlay.copy()
        underlay[1, 1, 3] = 0
        self.write_png("handwear.png", underlay)
        self.assertTrue(any("insufficient underlay" in p for p in self.audit()))

    def test_out_of_bounds_repair_is_blocked(self):
        self.manifest["alphaOnlyRepairs"][0]["allowedBounds"] = [2, 2, 3, 3]
        self.assertTrue(any("escaped allowed bounds" in p for p in self.audit()))


if __name__ == "__main__":
    unittest.main()
