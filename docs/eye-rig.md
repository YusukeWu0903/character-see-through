# Synchronized eye rig: design and acceptance

Date: 2026-09-20. Baseline task:
`Eris_full_body_casual_20260918_113905`.

## Research basis

The implementation follows established 2D character-rig practice without
copying an upstream runtime:

- Live2D's current standard parameter list defines one `ParamEyeBallX` and one
  `ParamEyeBallY`, each with a neutral zero and a `-1..1` range. This supports a
  shared two-axis gaze input rather than two independently inferred cursor
  targets. Diagonal input is limited to the same unit circle as axial input:
  <https://docs.live2d.com/en/cubism-editor-manual/standard-parameter-list/>.
- Live2D's current XY keyform guide explicitly evaluates eyeball motion as a
  3-by-3, nine-direction grid. The automated preview uses the same nine
  extrema/centre combinations: <https://docs.live2d.com/en/cubism-editor-manual/keyform-xydirection/>.
- Live2D's illustration and clipping guides separate eyelash, iris, and
  eyewhite, then use the eyewhite as the iris clipping material. The mask must
  be sampled at the iris destination coordinate, not its original texture
  coordinate: <https://docs.live2d.com/en/cubism-editor-tutorials/psd/> and
  <https://docs.live2d.com/en/cubism-editor-manual/clipping-mask/>.
- Live2D's eye-blink guide treats blink as one bounded percentage applied to
  both configured eye-open parameters. This rig keeps one blink value while
  retaining separate measured centres and separate approved eyelid artwork:
  <https://docs.live2d.com/en/cubism-editor-manual/eye-blink-settings/>.
- Spine's production guide independently recommends narrowly scoped clipping
  and warns that self-intersecting or unnecessarily complex clipping geometry
  is unreliable or expensive. This viewer therefore reuses the two existing
  eyewhite alpha textures and clips only the two iris layers:
  <https://en.esotericsoftware.com/spine-clipping>.

These sources establish principles, not visual acceptance. The Eris ranges are
measured from its own alpha geometry and are not universal character defaults.

## Runtime contract

1. Cursor and manual inputs are combined once into one normalized gaze vector.
   Both irises receive that exact vector. There is no per-eye cursor target,
   convergence term, or inward neutral bias.
2. `derive_eye_assets.py` measures the most restrictive symmetric pixel radius
   in quarter-pixel steps, capped at 2 px horizontally and 1.5 px vertically.
   It preserves at least 86.5% of each eye's neutral masked alpha; the hard
   eyewhite mask still guarantees zero spill onto skin. The common radius is
   written to `eye_assets.json`, and the more constrained eye wins.
3. Each iris selects only `eyewhite_<same-side>.png`. The fragment shader
   samples that mask at `uv + eyeOffset / 2`, matching the translated iris
   destination in the full-canvas coordinate system. Mask alpha multiplies
   premultiplied RGB and alpha together.
4. Per-eye centres are retained for blink deformation, but they do not change
   the shared gaze vector. This preserves the original eye spacing and cannot
   create a cross-eyed offset.
5. Runtime draw order is explicit: eyewhite, iris, open eyelash, approved
   closed-eyelid paint, eyebrow, then front hair. During blink, open eye parts
   vertically contract and fade while the approved closed-eye paint occludes
   them. Unapproved generated eyelids are never enabled by default.

## Eris and Miffy blink parity

The two viewers share one blink control and the same quadratic fade weights:
`closure = blink * blink`, open opacity `1 - closure`, closed-lid opacity
`closure`. Both also contract the open-eye art. Eris performs that contraction
on its separate WebGL eyewhite, iris and lash layers; Miffy contracts a
registered canvas eye stage because its high-resolution head had baked facial
details. The pixel deformation is therefore character-specific, not an
identical renderer. Describing Eris as a closed-lid-only overlay would be
incorrect; assess control, timing, contraction, and blend separately.

Miffy's `motion_v40` left-eye rectangular crop contained ear-root pixels in
open/backing art. At half blink those pixels moved/faded with the eye. The
non-production `motion_v43` candidate keeps the same blink control and artwork,
but removes only source-verified ear pixels from the eye assets, revealing the
pixel-identical whole-head underlay. Browser comparison found an identical
neutral frame and zero changes in the checked outer/lower ear-root regions at
half and full blink. This numerical check is not a substitute for reviewer
acceptance of the moving face and hair.

## Automated and visual gate

Run:

```powershell
python derive_eye_assets.py outputs/seethrough_local/<task>
python validate_eye_rig.py outputs/seethrough_local/<task>
node tests/check_eye_rig_browser.cjs
```

The Python validator writes under `<task>/_rig_assets/_validation/`:

- `gaze_nine_grid.png` — shared gaze at all nine X/Y combinations;
- `blink_open_half_closed.png` — 0%, 50%, and 100% blink;
- `eye_rig_report.json` — mask escape, common offset, coverage, centre-order,
  eyelid approval, and visual-review status.

The browser check writes rendered WebGL screenshots and a report under
`outputs/eye_rig_browser_validation/`. Delivery requires both automated
reports to pass and a manual inspection of the two contact sheets plus browser
screenshots. Automated success alone does not certify the artwork.
