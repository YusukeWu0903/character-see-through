---
name: seam-repair-promotion
description: Validate and promote a character-specific neck or shoulder seam repair candidate into an approved viewer asset. Use when reviewing or enabling seam-repair layers.
---
# Seam repair promotion

Treat seam repair as character-specific artwork, never a universal coordinate preset.

## Promotion rules

Start from a named task and candidate with before/after visual evidence. Validate canvas registration, alpha bounds, and distinct head-bound and torso-bound repair layers. A formal manifest must name the approved asset directory, source, layer order, and visual-review status.

Enable the approved manifest by default only after explicit approval. Candidate URL parameters may be retained for review but must never be required for the approved runtime path. Keep previous approved assets available for rollback.

## Release check

Render the normal production viewer without candidate query parameters. Confirm both repair layers load and the target neck/shoulder defects are corrected without new face, clothing, or joint artifacts. Record the decision and limits.