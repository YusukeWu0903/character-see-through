"""Behavioral checks for the reusable first-stage skill gate."""
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image


SCRIPT = Path(__file__).resolve().parents[1] / "skills/see-through-local/scripts/check.py"
spec = importlib.util.spec_from_file_location("see_through_skill_check", SCRIPT)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class SkillAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.task = self.root / "outputs/seethrough_local/Example_20260924_120000"
        self.task.mkdir(parents=True)
        (self.root / "viewer").mkdir()
        (self.root / "viewer/quality-baseline.json").write_text(
            json.dumps({"production": {"inference": {"layerResolution": 4}}}), encoding="utf-8"
        )
        self.original_project, self.original_out = gate.PROJECT, gate.OUT_ROOT
        gate.PROJECT = self.root
        gate.OUT_ROOT = self.task.parent
        self.addCleanup(self.restore_roots)
        (self.task / "_previews").mkdir()
        order = []
        report_layers = {}
        for name in gate.EXPECTED:
            filename = name + ".png"
            image = Image.new("RGBA", (4, 4), (20, 30, 40, 255))
            image.save(self.task / filename)
            image.save(self.task / "_previews" / filename)
            order.append({"name": name, "file": filename})
            report_layers[name] = {"status": "pass"}
        (self.task / "_order.json").write_text(json.dumps(order), encoding="utf-8")
        (self.task / "_alpha_validation.json").write_text(
            json.dumps({"layers": report_layers, "manual_review": [], "summary": {"deliverable": True}}), encoding="utf-8"
        )
        (self.task / "_alpha_checkerboard.png").write_bytes(b"preview")
        (self.task / "example_clean.psd").write_bytes(b"8BPSexample")
        self.quality = patch.object(gate.subprocess, "run", return_value=type("Result", (), {"returncode": 0})())
        self.quality.start()
        self.addCleanup(self.quality.stop)

    def restore_roots(self):
        gate.PROJECT, gate.OUT_ROOT = self.original_project, self.original_out

    def codes(self):
        return {issue["code"] for issue in gate.audit(self.task)["issues"]}

    def test_complete_mechanical_task_can_reach_visual_review(self):
        self.assertEqual(self.codes(), set())

    def test_missing_layer_blocks_handoff(self):
        (self.task / "mouth.png").unlink()
        self.assertIn("missing_layer", self.codes())

    def test_empty_optional_part_requires_review_not_fake_pixels(self):
        Image.new("RGBA", (4, 4), (0, 0, 0, 0)).save(self.task / "earwear.png")
        self.assertIn("empty_layer", self.codes())
        self.assertNotIn("missing_layer", self.codes())

    def test_wrong_task_location_is_blocked(self):
        codes = {issue["code"] for issue in gate.audit(self.root)["issues"]}
        self.assertIn("wrong_task_location", codes)


if __name__ == "__main__":
    unittest.main()
