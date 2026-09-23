---
name: see-through-local
description: Run and accept the first-stage see-through decomposition of a new character image into task-isolated RGBA layers and a clean PSD; use for input preflight, inference, alpha cleanup, and visual layer review, not for later rigging or public release.
---

# New-character layer decomposition

Use this skill for the first production stage of a character. Its output is a **reviewed layer set**, not a finished interactive rig. It applies to different characters without assuming Eris-specific anatomy, clothing, face coordinates, or assets. Work from this repository's resolved root; never use an old C-drive checkout because a prior run happened there.

## Boundaries

- The user's input image is the source of truth. Do not invent hidden anatomy or silently swap in a different image. Ask for a clearer/new source only when a defect cannot be judged or repaired from the supplied material.
- `SEE_THROUGH_HOME` selects the external upstream checkout. Read it, but do not patch or clean it without explicit permission; record any approved upstream delta in `patches/`. All deliverables remain under this repository's `outputs/seethrough_local/<unique-task>/`.
- `viewer/quality-baseline.json` is the production specification. Do not lower resolution, steps, depth, or viewer quality to make a run succeed. A change requires the approval and decision process in `docs/spec-change-policy.md`.
- Automated checks establish mechanical validity, **not artistic acceptance**. An empty accessory layer may be correct; a complete-looking alpha report may still hide torn joints, face seams, or bad inpainting. Do not promote or deliver a run until the visual gate is documented.
- Preserve raw/candidate evidence and prior accepted tasks. Do not overwrite an approved layer or manifest to experiment. PSD delivery must come from cleaned RGBA PNGs using `dev_psd_write.py`, never upstream's direct PSD output.

## Repeatable route

1. Read [run and acceptance](references/run-and-acceptance.md) completely for this stage. Confirm the input image, intended character framing, and the exact repository/task identity. Before costly inference, run `python skills/see-through-local/scripts/check.py preflight "<input-image>"` from the repository root. Resolve every `blocked` finding; assess every `review` warning with the user or source image. The check is read-only and does not claim GPU/model quality.
2. Run `python run_seethrough_local.py "<input-image>"` only when the user requested a new decomposition. Use the production defaults from the baseline. The wrapper creates a unique staged input and task; do not aim multiple runs at one upstream workspace or infer failure just because the head pass is slow.
3. On completion, run `python skills/see-through-local/scripts/check.py audit "outputs/seethrough_local/<task>"` and `python quality_contract.py --task "outputs/seethrough_local/<task>"`. `blocked` means stop; `review` means the run is not automatically deliverable; `machine_pass` only permits visual review. Keep the checkerboard, per-layer previews, alpha report, PNGs, order file, and clean PSD together.
4. Inspect the input versus reconstructed character and individual transparent layers at native scale, not only thumbnails. Review hair, face/eyes/mouth, neck/shoulders, clothing edges, hands/arms, hips/legs/feet, hidden-region inpainting, and semantic layer completeness. Compare cloud/reference output when available. Record each visible defect with layer, location, severity, and proposed repair or rerun. Use the triage table in the reference; never globally erase source-mismatching colours.
5. Mark the stage accepted only after the user or designated reviewer confirms the actual layered result. Hand off the immutable task path, report findings, any accepted exceptions, clean PSD, viewer URL, production settings, and remaining defects. Later eye, seam, expression, rig, and showcase skills start from this accepted task; do not silently perform those later stages as part of a decomposition request.

For PSD/alpha implementation changes, run `python -m pytest tests/test_seethrough_alpha.py -q`. For any material output or decision, follow `skills/daily-work-log/SKILL.md`. Read [sharing guidance](references/sharing.md) only when asked for an external link or public display.
