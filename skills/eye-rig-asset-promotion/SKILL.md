---
name: eye-rig-asset-promotion
description: Create, validate, and promote task-scoped split-eye, gaze, and closed-eyelid assets for a character viewer. Use when changing eye gaze, blink assets, or their approval manifest.
---
# Eye rig asset promotion

Operate only on a named character task that has passed its base layer and alpha gates. Keep all artwork full-canvas and task-scoped.

When responding to a user-reported localized blink or gaze artifact, first use the shared [visual-defect intake and routing](../character-assembly-repair/references/defect-intake-and-routing.md) to pin the exact candidate, state, location and source authority. Then apply this skill's eye-specific asset and acceptance rules; the shared intake does not replace them.

If a high-resolution replacement head has eyes, lashes, brows, and mouth baked into one static image, treat that as appearance approval only. Remove or reconstruct the baked features in a source-faithful base before introducing separate eye assets; otherwise the viewer will show doubled features during blink or gaze. Do not promote a fallback eyelid merely because a static face composite looks good.

## Contract

The runtime manifest must identify left/right eyewhite, irides, eyelashes, measured shared gaze limits, per-eye centres where needed, and only explicitly approved closed-eyelid artwork. Both eyes receive one shared gaze vector; clipping must use the matching eyewhite alpha.

## Split-eye route

Start with the task's **existing semantic `eyewhite.png`, `irides.png` and `eyelash.png`**, not a new hand-drawn oval or generic face crop. Run `python derive_eye_assets.py <task-directory>`; it splits each side, measures the common safe gaze radius and records the same-side eyewhite alpha mask. Read `docs/eye-rig.md` when implementing the viewer. Use `sharedGazeTarget`'s unit-circle vector and the measured per-task limits; do not reuse Eris's artwork or Miffy's guessed coordinates.

If a separately approved high-resolution replacement head has different eye colors or registration, first compare the direct derived assets in a **versioned, non-production** preview. Only when they visibly mismatch, register those measured semantic alphas against that replacement head's source pixels with `node skills/eye-rig-asset-promotion/scripts/package_semantic_eye_candidate.mjs <prior-manifest> <task>/_rig_assets/eye_assets.json <new-output-dir> <replacement-head.png> <inspected-color-gap-limit> <inspected-lash-alpha-limit>`. Calibrate and record the two limits from that character's actual source; this is a candidate bridge, not a new source of eye geometry. Preserve the direct-derived attempt as failure evidence and do not overwrite originals or earlier candidates.

The iris-free backing must remove every stationary pupil pixel without erasing the static eyelash. At neutral and near-zero gaze, check that swapping to moving-eye layers does not visibly pop; at extreme and diagonal gaze, check that the iris does not fork, drift onto skin or disappear. A mask-coverage pass alone cannot catch a mismatched replacement-head color plate.

## Validation

Check canvas size, alpha, registration, manifest schema, and that every runtime asset named by the manifest exists. Render neutral, cardinal, diagonal, and open/half/closed blink states. Verify no iris pixels remain outside its own eyewhite mask and that diagonal motion stays within the approved coverage threshold.

Before compositing a supplied closed-eye portrait, inspect each detached eyelid PNG alone on both dark and light backgrounds at native scale and enlarged. An eye-sized crop may still contain ear, brow, cheek or a low-alpha skin rectangle; its alpha footprint must follow only the painted lid region, with feathered edges. Do not over-threshold the skin by color until eyelashes or soft lid shading break apart. Then compare the feature-free base, open, half-closed and fully closed frames on the assembled face, including a paused and moving preview. Record whether the new character follows the reference character's **control semantics, pulse timing and open/closed layer blend** separately; matching toggle labels alone is not parity. Keep character-specific eye geometry and source pixels even when reusing a proven blend rule.

Also inspect the *base, open and eye-white backings*, not just the closed lid: a rectangular backing can extend into an ear or hair even when its closed-lid alpha is clean. Compare each backing composite against the pinned source head outside the painted eye. If the eye art ends before that collision, `scripts/trim_eye_backing_edge.mjs` can create a new alpha-only, feathered candidate from the previous manifest; first measure the safe boundary and verify iris, lash, lid and mask have no pixels there. Preserve the original neutral `open` artwork so zero blink remains pixel-identical to the reviewed assembly; use the optional eye-only `openMotion` artwork solely inside the moving blink stage. Keep the previous manifest for rollback, then inspect open/half/closed states and independent head/hair movement. Do not trim a genuinely painted feature or hide missing anatomy with a skin plate.

For a manifest with separate closed PNGs, run `node skills/eye-rig-asset-promotion/scripts/audit_closed_alpha.mjs <eye-manifest.json>`. It verifies image hashes and reports alpha bounds, edge contact and broad crop coverage. A `review` finding requires visual judgment and source-specific repair; a `machine_pass` does not prove the sprite is clean.

For a registered iris candidate, run `python skills/eye-rig-asset-promotion/scripts/audit_iris_candidate.py <eye-manifest.json>` and inspect its nine browser-rendered gaze frames. The audit reuses Eris's minimum relative mask-coverage rule and reports stationary dark pigment not explained by the lash layer. Record any source-dependent thresholds in the manifest. Compare near-zero gaze to exact neutral, not only the far extrema.

Automated checks do not replace visual review. Do not promote generated fallback or candidate art without recorded approval. Preserve the previous approved manifest/assets for rollback.
