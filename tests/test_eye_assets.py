from pathlib import Path

from PIL import Image, ImageDraw

from derive_eye_assets import derive
from derive_closed_eyelid_assets import derive as derive_closed
from derive_approved_eyelid_assets import derive as derive_approved


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


def test_derives_full_canvas_closed_eyelid_layers(tmp_path: Path):
    layer().save(tmp_path / "irides.png")
    layer(boxes=((8, 18, 23, 32), (48, 18, 63, 32))).save(tmp_path / "eyewhite.png")
    layer(boxes=((6, 18, 25, 34), (46, 18, 65, 34))).save(tmp_path / "eyelash.png")
    derive(tmp_path)
    report = derive_closed(tmp_path)
    assert report["source"] == "compressed_existing_eyelash"
    for side in ("left", "right"):
        image = Image.open(tmp_path / "_rig_assets" / f"eyelid_closed_{side}.png")
        assert image.mode == "RGBA"
        assert image.size == (80, 60)
        assert report["layers"][side]["closedHeight"] < 16


def test_derives_approved_closed_eyelids_from_only_the_eye_difference(tmp_path: Path):
    source = Image.new("RGBA", (160, 240), (248, 224, 213, 255))
    source_draw = ImageDraw.Draw(source)
    source_draw.rectangle((62, 36, 76, 43), fill=(25, 25, 25, 255))
    source_draw.rectangle((92, 36, 106, 43), fill=(25, 25, 25, 255))
    source.save(tmp_path / "source.png")
    closed = source.copy()
    closed_draw = ImageDraw.Draw(closed)
    closed_draw.line((62, 42, 69, 45, 76, 42), fill=(45, 20, 20, 255), width=2)
    closed_draw.line((92, 42, 99, 45, 106, 42), fill=(45, 20, 20, 255), width=2)
    closed.save(tmp_path / "closed.png")
    layer(size=(160, 240), boxes=((58, 34, 80, 47), (88, 34, 110, 47))).save(tmp_path / "eyelash.png")
    layer(size=(160, 240), boxes=((60, 31, 78, 39), (90, 31, 108, 39))).save(tmp_path / "eyebrow.png")
    layer(size=(160, 240), boxes=((62, 36, 76, 43), (92, 36, 106, 43))).save(tmp_path / "irides.png")
    layer(size=(160, 240), boxes=((60, 34, 78, 45), (90, 34, 108, 45))).save(tmp_path / "eyewhite.png")
    derive(tmp_path)
    report = derive_approved(tmp_path, tmp_path / "source.png", tmp_path / "closed.png")
    assert report["source"] == "approved_artwork"
    assert all(report["layers"][side]["alphaPixels"] > 0 for side in ("left", "right"))
    assert all(report["layers"][side]["eyebrowOverlapPixels"] == 0 for side in ("left", "right"))
