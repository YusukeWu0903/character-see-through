# Run and acceptance checklist

## Inputs and outputs

- Put reusable source images in `inputs/` when practical. Existing root-level
  images are historical examples and should not be relocated during a run.
- `run_seethrough_local.py` stages an input under
  `outputs/seethrough_local/_staging/` with a unique name so the upstream fixed
  workspace naming cannot collide.
- The result is a unique directory such as
  `outputs/seethrough_local/Eris_full_body_casual_YYYYMMDD_HHMMSS/` containing
  17 full-canvas RGBA layers, `_order.json`, `_alpha_validation.json`,
  `_alpha_checkerboard.png`, `_previews/`, and `<input>_clean.psd`.

## Quality review

1. Open `http://127.0.0.1:8010/preview?local=<task-name>`.
2. Compare local (right) against cloud reference (left), especially hair and
   arm outlines, mouth/face seams, residual grey plates, legs, and feet.
3. Open the checkerboard preview. Confirm the canvas outside each subject is
   transparent rather than grey/white opaque pixels.
4. Read the JSON report. A layer marked `manual-review` makes the run
   non-deliverable until its reason is assessed. For barefoot characters, a
   nearly empty `footwear` layer can be semantically correct; record that
   finding rather than treating it as missing feet.
5. Report visual differences separately from alpha validation. Never call a
   run cloud-equivalent unless both pass.

## Viewer

Start the local server if necessary:

```powershell
python main.py
```

`preview_viewer.html` has four viewer-only controls: breath, parallax, layer
gap, and hair sway. Their rendered values are initialized from the sliders;
the current maximum range is half of the original range.
