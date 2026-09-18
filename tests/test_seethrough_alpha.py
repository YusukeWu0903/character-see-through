"""Repeatable regression tests for see-through's local alpha post-processing."""
import importlib.util
import json
import ast
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from run_seethrough_local import clean_layer_rgba, cleanup_layers


UPSTREAM_UTILS = Path(r"D:/ProgramsAI/see-through/common/utils/inference_utils.py")


def load_upstream_alpha_cleaner():
    """Load only the patched function, without loading the GPU inference stack."""
    if not UPSTREAM_UTILS.exists():
        raise unittest.SkipTest("local see-through checkout is unavailable")
    import cv2
    source = ast.parse(UPSTREAM_UTILS.read_text(encoding="utf-8"))
    node = next(n for n in source.body if isinstance(n, ast.FunctionDef)
                and n.name == "clear_edge_connected_neutral_background")
    module = ast.Module(body=[node], type_ignores=[])
    namespace = {"np": np, "cv2": cv2}
    exec(compile(module, str(UPSTREAM_UTILS), "exec"), namespace)
    return namespace[node.name]


def plate_with_internal_grey():
    """A grey plate plus a disconnected grey garment swatch."""
    rgba = np.zeros((32, 32, 4), dtype=np.uint8)
    rgba[:, :, :3] = (180, 178, 177)
    rgba[:, :, 3] = 255
    # Transparent moat disconnects the legitimate, similarly-grey garment.
    rgba[10:22, 10:22, 3] = 0
    rgba[13:19, 13:19, :3] = (175, 174, 173)
    rgba[13:19, 13:19, 3] = 255
    return rgba


class AlphaCleanupTests(unittest.TestCase):
    def test_edge_connected_grey_plate_becomes_transparent(self):
        cleaned, stats = clean_layer_rgba(plate_with_internal_grey())
        self.assertEqual(stats["before"]["edge_connected_background_pixels"], 32 * 32 - 12 * 12)
        self.assertEqual(stats["after"]["edge_connected_background_pixels"], 0)
        self.assertEqual(int(cleaned[0, 0, 3]), 0)

    def test_disconnected_internal_grey_is_not_deleted(self):
        cleaned, _ = clean_layer_rgba(plate_with_internal_grey())
        self.assertTrue(np.all(cleaned[13:19, 13:19, 3] == 255))

    def test_source_match_preserves_grey_garment_but_removes_mismatched_plate(self):
        rgba = np.zeros((16, 16, 4), dtype=np.uint8)
        rgba[:, :, :3] = (185, 183, 182); rgba[:, :, 3] = 255
        reference = rgba.copy()
        # The real garment has the same neutral source colour.  The plate does not.
        reference[5:11, 5:11, :3] = (185, 183, 182)
        rgba[5:11, 5:11, :3] = (185, 183, 182)
        reference[:5, :, :3] = (255, 255, 255)
        cleaned, stats = clean_layer_rgba(rgba, reference)
        self.assertEqual(int(cleaned[0, 0, 3]), 0)
        self.assertTrue(np.all(cleaned[5:11, 5:11, 3] == 255))
        self.assertGreater(stats["removed_pixels"], 0)

    def test_cleanup_writes_alpha_report_and_checkerboard(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            Image.fromarray(plate_with_internal_grey(), "RGBA").save(out / "topwear.png")
            (out / "_order.json").write_text(json.dumps([{"name": "topwear", "file": "topwear.png"}]))
            report = cleanup_layers(out)
            self.assertEqual(report["layers"]["topwear"]["status"], "pass")
            self.assertEqual(Image.open(out / "topwear.png").getchannel("A").getpixel((0, 0)), 0)
            self.assertTrue((out / "_alpha_validation.json").exists())
            self.assertTrue((out / "_alpha_checkerboard.png").exists())

    def test_patched_upstream_exporter_clears_plate_before_png_write(self):
        cleaned = load_upstream_alpha_cleaner()(plate_with_internal_grey())
        self.assertEqual(int(cleaned[0, 0, 3]), 0)
        self.assertTrue(np.all(cleaned[13:19, 13:19, 3] == 255))

    @unittest.skipUnless(importlib.util.find_spec("psd_tools"), "psd-tools is installed from requirements.txt")
    def test_psd_pixel_layer_preserves_alpha(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rgba = np.zeros((8, 8, 4), dtype=np.uint8)
            rgba[3, 3] = (30, 40, 50, 255)
            Image.fromarray(rgba, "RGBA").save(root / "part.png")
            (root / "_order.json").write_text(json.dumps([{"name": "part", "file": "part.png"}]))
            psd = root / "out.psd"
            subprocess.run([sys.executable, "dev_psd_write.py", "--dir", str(root), "--order", str(root / "_order.json"),
                            "--out", str(psd), "--h", "8", "--w", "8"], check=True)
            from psd_tools import PSDImage
            layer = list(PSDImage.open(psd))[0]
            restored = np.asarray(layer.composite().convert("RGBA"))
            self.assertEqual(int(restored[0, 0, 3]), 0)
            self.assertEqual(int(restored[3, 3, 3]), 255)

    @unittest.skipUnless(importlib.util.find_spec("psd_tools"), "psd-tools is installed from requirements.txt")
    def test_psd_keeps_order_and_full_canvas_alignment(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bottom = np.zeros((4, 4, 4), dtype=np.uint8); bottom[:, :] = (255, 0, 0, 255)
            top = np.zeros((4, 4, 4), dtype=np.uint8); top[1, 1] = (0, 0, 255, 255)
            Image.fromarray(bottom, "RGBA").save(root / "bottom.png")
            Image.fromarray(top, "RGBA").save(root / "top.png")
            order = [{"name": "bottom", "file": "bottom.png"}, {"name": "top", "file": "top.png"}]
            (root / "_order.json").write_text(json.dumps(order))
            psd = root / "ordered.psd"
            subprocess.run([sys.executable, "dev_psd_write.py", "--dir", str(root), "--order", str(root / "_order.json"),
                            "--out", str(psd), "--h", "4", "--w", "4"], check=True)
            from psd_tools import PSDImage
            loaded = PSDImage.open(psd)
            self.assertEqual([layer.name for layer in loaded], ["bottom", "top"])
            composite = loaded.composite().convert("RGBA")
            self.assertEqual(composite.getpixel((1, 1)), (0, 0, 255, 255))
            self.assertEqual(composite.getpixel((0, 0)), (255, 0, 0, 255))


if __name__ == "__main__":
    unittest.main()
