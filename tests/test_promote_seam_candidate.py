import json
from pathlib import Path

from PIL import Image

from promote_seam_candidate import promote


def test_promotes_reviewed_seam_candidate_atomically(tmp_path: Path):
    Image.new("RGBA", (32, 24), (1, 2, 3, 255)).save(tmp_path / "face.png")
    source = tmp_path / "_rig_candidates" / "seams_v2"
    source.mkdir(parents=True)
    for name in ("seam_repair_head", "seam_repair_torso"):
        Image.new("RGBA", (32, 24), (10, 20, 30, 128)).save(source / f"{name}.png")
    (source / "report.json").write_text(json.dumps({
        "schemaVersion": 2,
        "source": "registered_original",
        "status": "candidate",
        "registration": {"inliers": 40},
        "coverage": {"pixels": 10},
    }), encoding="utf-8")

    result = promote(tmp_path, "seams_v2", "user approved this repair")
    manifest = json.loads((tmp_path / "_rig_assets" / "seam_assets.json").read_text(encoding="utf-8"))
    assert manifest["visualReview"]["status"] == "passed"
    assert manifest["visualReview"]["approval"] == "user approved this repair"
    assert manifest["layers"] == ["seam_repair_head", "seam_repair_torso"]
    assert Path(result["assets"]).is_dir()
    assert result["rollbackManifest"] is None
    for name in manifest["layers"]:
        assert (Path(result["assets"]) / f"{name}.png").is_file()
