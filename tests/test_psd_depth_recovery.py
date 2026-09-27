import importlib.util
from pathlib import Path
import json
import numpy as np
from PIL import Image
import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('depth_recovery', ROOT/'tools/recover_psd_depth.py')
route = importlib.util.module_from_spec(spec)
spec.loader.exec_module(route)

def test_original_psd_extract_matches_imported_pixels(tmp_path):
    psd = ROOT/'Character/003_Mimi/Mimi_full_body_casual.psd'
    source = ROOT/'Character/003_Mimi/Mimi_full_body_casual_rb.png'
    candidate = tmp_path/'candidate'
    route.prepare(psd, source, candidate)
    prov = json.loads((candidate/'provenance.json').read_text())
    assert len(prov['layers']) == 16
    assert prov['registration']['resized'] == [960,1280]
    assert prov['registration']['offset'] == [160,0]
    for rec in prov['layers']:
        raw = ROOT/'outputs/seethrough_local/Mimi_cloud_20260927'/(rec['tag'].replace(' ','')+'.png')
        assert np.array_equal(np.asarray(Image.open(raw)), np.asarray(Image.open(candidate/'input'/(rec['tag']+'.png'))))
    with pytest.raises(FileExistsError):
        route.prepare(psd, source, candidate)
