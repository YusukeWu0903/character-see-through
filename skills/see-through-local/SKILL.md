---
name: see-through-local
description: Run and validate the local see-through anime-character layer decomposition pipeline, including clean RGBA PNGs, direct PSD export, and cloud-reference viewer comparison.
---

# Local see-through decomposition

Use this skill for work in this repository involving `run_seethrough_local.py`,
semantic character layers, alpha cleanup, PSD delivery, the preview viewer, or
shareable viewer links.

## Core contract

- Keep generated deliverables in `outputs/seethrough_local/<task>/`; never mix
  one run's layers with another run.
- The deliverable PSD must be written from the validated RGBA PNGs with
  `dev_psd_write.py`. Do not use the upstream `--save_to_psd` output as the
  delivered PSD.
- Do not globally erase pixels by colour or source-image mismatch. LayerDiff
  inpaints hidden regions; destructive cleanup creates facial seams and halos.
  Only clear a confirmed neutral region connected to the canvas edge.
- Treat `_alpha_validation.json`, `_alpha_checkerboard.png`, and the visual
  cloud-vs-local comparison as separate checks. An alpha pass alone is not an
  appearance-quality pass.
- see-through is an external upstream dependency, located through the
  `SEE_THROUGH_HOME` environment variable. Do not modify it without explicit
  user permission. Keep an approved patch record in `patches/`.

## Normal run

From the repository root, run:

```powershell
python run_seethrough_local.py "<input.png>"
```

The checked-in defaults match the upstream quality defaults: 1280 LayerDiff
resolution, 30 inference steps, and 768 depth resolution. On a 12 GB GPU with
group offload, this can take well over an hour; do not claim a run is stalled
solely because head-layer files have not yet appeared.

Read [the run and acceptance checklist](references/run-and-acceptance.md) for
output paths, quality gates, and viewer usage. Read
[sharing guidance](references/sharing.md) only when the user asks to publish or
send the viewer to someone else.

## Change discipline

Run `python -m pytest tests/test_seethrough_alpha.py -q` after changing alpha
cleanup or PSD-writing logic. Keep viewer control changes in
`preview_viewer.html`; reload the local viewer to verify slider defaults and
their actual animation state agree.
