---
name: character-assembly-repair
description: Assemble decomposed character layers and diagnose localized visual defects in assembly or motion previews; repair source-faithful face, occlusion, and seams, not inference or public release.
---

# Character assembly and repair

Use this stage after `see-through-local` creates a task-isolated RGBA set. The source illustration remains the appearance authority; extraction PNGs are evidence, not approved artwork. Never reuse Eris-specific order, masks, coordinates, or seam patches as another character's defaults.

For a user-reported local visual defect, read [defect intake and routing](references/defect-intake-and-routing.md) before selecting a repair method. It applies to assembly and motion previews; route eye or motion behavior to their specialist skills after locating the owning asset or transform. Do not make the user repeat information already visible in the task, preview, or supplied images.

1. Read [assembly and acceptance](references/assembly-and-acceptance.md) before editing a candidate. Confirm the exact task, source, layer audit, reviewer findings, and dirty worktree. Preserve the original PNGs, `_order.json`, and clean PSD. Use a versioned candidate manifest naming every replacement, source, render order, motion parent, occlusion rule, and review state. Run `python skills/character-assembly-repair/scripts/check.py <task-directory> <candidate-manifest>` before presenting the candidate; this checks structure, not visual quality.
2. Inspect the source and composite at face, shoulder, and full-body zoom. Toggle, solo, and vary opacity for each part; test the proposed draw order. Inspect candidate PNG alpha on both light and dark backgrounds at native scale: a low-alpha rectangle, a dark overlap edge, or a source-white antialias can be invisible on one background. Hiding a defective component is not a repair. Record each defect's location, owning layer, underlying layer, and screenshot. For crop-edge and joint work, read [edge and seam diagnostics](references/edge-and-seam-diagnostics.md).
3. Repair in small independent candidates: facial backing/edge artifacts, missing brows, source-faithful ear occlusion, then neck/shoulder joins. Do not redraw hidden anatomy. Keep head-bound repairs with the head, torso/shoulder repairs with the torso, and minimize alpha footprints so they cannot cover unrelated garments or limbs.
4. Review neutral and moved poses, front hair on/off, source versus candidate, and individual parts. Vary the head, torso, hair, and arm parents separately where the rig permits; a static assembly pass does not establish a motion pass. Verify no doubled contours, color plates, or new occlusion tears. Machine validity and visual acceptance are separate. Do not promote or publish before the user approves the actual candidate.
5. Export a candidate PSD from reviewed RGBA PNGs, run `python quality_contract.py --task <task>`, and record evidence, open defects, rollback path, and reviewer decision in the task and shared daily log.

This is a portable workflow inspired by part trees and draw slots, not a promise of native Spine/Cubism files. Follow `seam-repair-promotion` when making a seam candidate default and `eye-rig-asset-promotion` for eye-motion assets. Do not change the external see-through checkout without authorization.
