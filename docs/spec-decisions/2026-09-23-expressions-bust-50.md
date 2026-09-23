# 2026-09-23: Approved facial expressions and bust default 50

User approved the angry v3 mouth correction, combined neutral/happy/angry expression showcase release, and changing the production chest/bust motion control default from 28 to 50. This approval is for the current full-body character viewer; a separate half-body illustration remains only a consideration.

Promote only the 10 PNG assets from `facial_showcase_v1` to `_rig_assets/expressions_v1_20260923/`. Keep neutral as the initial expression and allow independent mouth selection. Use the mouthless head seam patch so the original mouth cannot show through. Preserve approved eyes, gaze, blink and shoulder seams. Record exact hashes in `expression_assets.json` and the locked quality contract. A release must pass native-resolution task validation, default UI checks, public asset checks and interactive browser review.

Rollback: restore the previous production quality baseline and viewer release commit, and omit `expression_assets.json` loading. Do not overwrite the earlier approved eye or seam assets.
