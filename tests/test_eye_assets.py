from pathlib import Path

from PIL import Image, ImageDraw

from derive_eye_assets import derive


def layer(size=(80, 60), boxes=((10, 20, 20, 30), (50, 20, 60, 30))):
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    for box in boxes:
        draw.rectangle(box, fill=(10, 20, 30, 255))
    return image


def test_derives_full_canvas_left_right_assets_and_safe_gaze_limit(tmp_path: Path):
    layer().save(tmp_path / "irides.png")
    layer(boxes=((8, 18, 23, 32), (48, 18, 63, 32))).save(tmp_path / "eyewhite.png")
    report = derive(tmp_path)
    assert report["layers"]["irides"]["left"]["bbox"] == [10, 20, 21, 31]
    assert report["limits"]["gazeX"] > 0
    # The eye pair may be off-centre in a character frame; preserve its
    # measured position instead of assuming a centre-aligned portrait.
    assert report["eyeCenter"] == [-0.1125, 0.15]
    for name in ("irides_left", "irides_right", "eyewhite_left", "eyewhite_right"):
        image = Image.open(tmp_path / "_rig_assets" / f"{name}.png")
        assert image.size == (80, 60)
        assert image.mode == "RGBA"


def test_rejects_missing_eye_component(tmp_path: Path):
    layer(boxes=((10, 20, 20, 30),)).save(tmp_path / "irides.png")
    layer().save(tmp_path / "eyewhite.png")
    try:
        derive(tmp_path)
    except ValueError as error:
        assert "exactly two" in str(error)
    else:
        raise AssertionError("missing component must reject derivation")
