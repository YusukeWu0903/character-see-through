import json
import tempfile
import unittest
from pathlib import Path

from quality_contract import LOCKED_ACCEPTED_TASKS, LOCKED_PRODUCTION, load_quality_baseline, verify_repository
from run_seethrough_local import DEFAULT_DEPTH_RESOLUTION, DEFAULT_INFERENCE_STEPS, DEFAULT_LAYER_RESOLUTION


PROJECT = Path(__file__).resolve().parents[1]


class QualityContractTests(unittest.TestCase):
    def test_locked_baseline_and_runtime_defaults_match(self):
        baseline = load_quality_baseline()
        self.assertEqual(baseline["production"], LOCKED_PRODUCTION)
        self.assertEqual(baseline["acceptedTasks"], LOCKED_ACCEPTED_TASKS)
        self.assertEqual(DEFAULT_LAYER_RESOLUTION, 1280)
        self.assertEqual(DEFAULT_INFERENCE_STEPS, 30)
        self.assertEqual(DEFAULT_DEPTH_RESOLUTION, 768)

    def test_repository_profiles_are_isolated(self):
        baseline = verify_repository()
        profile = baseline["nonProductionProfiles"]["browser-validation"]
        self.assertTrue(profile["nonProduction"])
        self.assertEqual(profile["textureUploadMax"], 768)

    def test_unapproved_production_change_fails_closed(self):
        baseline = load_quality_baseline()
        baseline["production"]["viewer"]["textureUploadMax"] = 768
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "changed-baseline.json"
            path.write_text(json.dumps(baseline), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "explicit user approval"):
                load_quality_baseline(path)


if __name__ == "__main__":
    unittest.main()
