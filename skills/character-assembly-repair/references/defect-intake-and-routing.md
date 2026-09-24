# Local visual-defect intake and routing

Use for a specific unwanted pixel, broken contour, halo, doubled part, colour plate, gap, or motion-only overlap in a layered character preview. This is a diagnosis entrypoint, not a universal eraser or authority to invent missing artwork. The character's source and the user's stated appearance goal decide what should remain visible.

## Minimum evidence for a useful report

Collect or infer these four items before editing. Ask only for the missing item that changes the repair decision, in the user's language; a screenshot or preview may already provide several of them.

1. **Exact candidate**: task identifier plus preview URL, assembly manifest, or rig version. A screenshot of an unversioned old preview is not sufficient to select an asset to change.
2. **Location and symptom**: marked image or an unambiguous landmark and whether the user sees extra pixels, missing pixels, wrong colour, wrong placement, or an unwanted line. A tight crop helps locate the defect, but retain a full-face/body view for context.
3. **Trigger state**: whether it appears at neutral or only during blink, gaze, expression, head/torso/hair movement, or a control combination. Capture the same place in one unaffected state when possible. Record relevant control values rather than assuming a static screenshot represents every state.
4. **Appearance authority**: the original drawing, an approved high-resolution/feature-free source, or a specific user instruction about the intended contour or occlusion. If neither source nor intent establishes what belongs there, diagnose without painting or erasing ambiguous anatomy; request the smallest necessary clarification.

Suggested user-facing request: “請給我目前的預覽連結、圈出問題的畫面、出現時的動作或開關狀態，以及應該以哪張原畫為準；已提供的部分不用重傳。” Do not impose this form when the existing context already answers it.

## Diagnose before choosing a repair

1. Reproduce the reported state on the exact candidate, register the screenshot to the asset canvas, and compare the same crop at native size and readable enlargement. Inspect the source and prior candidate, not only the latest composite. Preserve the unmodified candidate as rollback.
2. Toggle or solo suspected layers with their underlay on checkerboard, light, and dark backgrounds. Compare RGB and alpha separately. Classify the cause as source-painted detail, extraction alpha/RGB edge, stale pixels in a moving backing, draw-order/occlusion, missing underfill, registration, or motion-parent/transform behavior. A defect visible only during blink or movement is not automatically in the lid or moving top layer; inspect every contributing backing.
3. Route the proven cause: use [edge and seam diagnostics](edge-and-seam-diagnostics.md) for crop edges, outlines, underfill and joints; use `eye-rig-asset-promotion` for blink/gaze assets and their neutral/moving blend; use `character-motion-rig` for deformation or parent/transform defects. Do not bypass those skill contracts by adding a one-off viewer special case.
4. Make the smallest versioned, task-scoped candidate supported by source evidence. Record which asset and pixels/region changed, whether RGB or alpha changed, and what stayed byte-identical. Never assume “cleaning” means erasing: the correct repair may restore source-painted colour, remove exterior alpha, change draw order, or correct a moving asset's bounds.

## Acceptance and stop conditions

- Compare prior and candidate in the reported state and in a neutral control state. Check adjacent hair, skin, garments and underlay; test the relevant independent motion parents and control extremes, not unrelated animation by default.
- Measure changed-pixel bounds and alpha increases/decreases where raster assets change. A clean numerical diff is evidence of scope, not proof of artistic quality; inspect the enlarged composite for new dots, pale holes, doubled contours and lost details.
- Keep the candidate non-production with rollback until the user reviews the actual visible result. If the source is contradictory, the affected part cannot be isolated, or the fix would replace substantial anatomy or cover another moving part, stop and offer the evidence and options rather than guessing.
