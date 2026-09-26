---
name: character-expression-transplant
description: Transplant source-drawn mouth and expression parts into a reviewed character rig, with feature removal, registration, switching, and visual acceptance. Use after the static face and eye rig have named candidates; not for generating new artwork or publishing.
---

# Source-drawn facial expressions

Start with the named character task, the exact reviewed assembly/head candidate, the current eye rig, and the user's supplied expression sheets. Read `skills/character-motion-rig/references/facial-motion.md` and the existing character's expression implementation before changing artwork or controls. Preserve original images and every prior candidate; keep all generated parts and manifests under the task.

1. Inventory the source sheets by expression, pose, angle, resolution, and visible brow/eye/mouth. Pick one requested expression at a time. Identify which features are already baked into the accepted head and which separated eye assets must remain independently animated. Do not borrow hair, ears, clothing, or skin from a differently posed sheet by default.
2. Register the source to the target with at least two stable facial landmarks and record the transform, crop, source hash, and target hash. Trim detached artwork's stray edge pixels **before** measuring its bounds. Inspect the proposed mouth/brow assets alone on dark and light backgrounds at native and enlarged scale. Retain source lip colour and fine contours; do not redraw a source shape to simplify alignment.
3. Prepare a feature-free backing only where a replacement would otherwise double the original mouth/brow. Preserve nostrils, cheek shading, jaw outline, and eye rig. Verify the bare backing alone, then neutral and the new expression separately. Reject a rectangular skin plate, colour halo, remaining old line, missing nostril, clipped hair, or pixel remnant at the chin.
4. Version a candidate manifest with source/art hashes, full-canvas asset paths, registration, layer/draw order, supported expression-to-part mapping, rollback, and `pending` review. Reuse the existing expression-switching semantics: a named expression selects compatible brow/eye/mouth assets; a separate mouth control may override its default. Do not claim a smooth transition until intermediate frames have been examined for double features.
5. Test the live viewer at neutral, the new expression, mouth override, blink open/half/closed, gaze extrema, head/body motion, pause, and reset. Compare zero expression pixel-for-pixel with the previous reviewed candidate. Check brows, lids and mouth at native and face zoom, plus source likeness. Machine checks and internal visual review do not promote the candidate; obtain user approval for the actual interactive expression first.

If the source art cannot support a clean transplant, preserve the failed attempt and report the specific missing or misregistered feature. Ask for better art or manual retouch instead of silently inventing it. Run `python quality_contract.py --task <task-directory>` before handoff and record material evidence in the shared daily log.

## Mouth-specific safeguards

- Audit every row's skin sampling endpoints against the actual head alpha and jaw ink before building a mouthless backing. A cheek endpoint that is safe beside the lips can cross the tapering jaw below them and interpolate a dark chin stripe. Use task-measured clean-skin samples or stop the repair footprint; reject contaminated samples programmatically, preserve alpha, and inspect the bare backing before overlaying lips. Keep these coordinates and thresholds in the task builder, not this SKILL.
- Composite the selected mouth with its backing **before** existing head yaw/pitch deformation and lighting. Include the active mouth in any head-render cache key. Keep original neutral artwork as a bypass and compare it against the preceding candidate; verify unchanged pixels outside the declared mouth owner, not just visibly distinct sprites.
- An optional auto-talk demonstration is not audio lip sync. Record the user's selected control mode; default the demo off, make pause/reset consistent with existing controls, and let manual selection override the demo. Discrete source-art switching is preferable to an unverified crossfade that doubles mouth ink.
