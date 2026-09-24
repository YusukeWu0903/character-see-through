---
name: seam-repair-promotion
description: Validate and promote a character-specific neck or shoulder seam repair candidate into an approved viewer asset. Use when reviewing or enabling seam-repair layers.
---
# Seam repair promotion

Treat seam repair as character-specific artwork, never a universal coordinate preset. This skill governs candidate review and promotion; use `character-assembly-repair` and its edge/seam diagnostics for provenance and initial repair.

## Promotion rules

Start from a named task and candidate with before/after visual evidence on dark and light backgrounds. Validate canvas registration, changed RGB/alpha bounds, original-image preservation, and the actual motion parent of each repair. A valid repair may be a corrected existing layer, rather than an added skin patch; require separate head-bound and torso-bound assets only when both surfaces actually need them. A formal manifest must name the approved asset directory, source, layer order, and visual-review status.

Before approval, check neutral and moved poses with head, torso, hair and arm ownership tested independently. If a candidate fixes the static frame but reveals an arm-root gap under independent motion, keep it non-production and route that failure to the character rig stage. A checker result or static screenshot alone cannot authorize promotion.

Enable the approved manifest by default only after explicit approval. Candidate URL parameters may be retained for review but must never be required for the approved runtime path. Keep previous approved assets available for rollback.

## Release check

Render the normal production viewer without candidate query parameters. Confirm both repair layers load and the target neck/shoulder defects are corrected without new face, clothing, or joint artifacts. Record the decision and limits.
