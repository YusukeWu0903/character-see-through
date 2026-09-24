# Assembly and acceptance: reusable second stage

## Structure

Keep three concepts distinct: a semantic **part** (face, hair, garment), its **draw slot** (back-to-front compositing order), and its **motion parent** (head, torso, left/right arm, hair). One part may need a separate occluding foreground fragment; never force one global sort order to solve contradictory overlaps. A repair belongs to the motion parent of the surface it repairs. Record full-canvas registration and alpha bounds for every candidate PNG.

The candidate manifest should identify the exact task and source hash, original layer path/hash, replacements, back-to-front slot list, parent assignment, optional masks/occlusion, evidence images, and `pending`/`accepted` review status. Candidate names are immutable once reviewed. Never copy a previous character's seam coordinates or alpha mask without source-specific registration and inspection.

## Visual gates

| Gate | Inspection | Failure example |
| --- | --- | --- |
| Source likeness | Source and composite at matched scale, neutral pose | Synthesized visible ear where the source hides it |
| Face parts | Bare face, each part solo, normal composite at face zoom | Missing brow, nose skin plate/halo, doubled contour |
| Occlusion/order | Foreground hair/clothing on/off and order changes | Back hair on top of shirt, ear emerging through hair |
| Neck/shoulders | Original and candidate, both shoulders and neck center | Dark duplicate edge, skin patch over strap |
| Motion ownership | Head/body/hair/arms moved independently at moderate and extreme values | Repair stays behind when head moves; arm deforms with chest |
| Export | PNG composite compared with candidate PSD | Alpha or draw order differs |

For a localized artifact, isolate whether the dark line is baked into the source illustration, created by a cut edge, or revealed by movement. A repair that merely covers the seam in one neutral screenshot is insufficient. Use the smallest practical source-matched patch; make an alternate candidate if the repair cannot preserve clothing and arm independence.

For a dark outline in a detached facial PNG, first toggle that PNG off to prove provenance and inspect the face base beneath it. If the base retains intact skin, a candidate may attenuate only the detached PNG's dark-edge alpha; it need not paint a skin cover. Require exact canvas registration, unchanged RGB, no new opaque pixels, side-by-side source/composite review, and an explicit check that the feature has not disappeared or become dotted. A thin feature may need stronger removal than a wider lip; preserve each failed candidate and do not apply one threshold to every face.

When the user provides a higher-resolution source drawing, prefer a source-pixel transplant candidate over further erosion of an already failed extracted feature. Register source and layer canvas with multiple landmarks, use the bare-head reference for facial parts and the haired image for occlusion review, keep each replacement in a versioned full-canvas transparent PNG, and verify that small semantics such as nostrils survive. A machine-valid transform does not establish likeness or acceptable edge color. Keep eye whites, irides, and lashes independently riggable; do not flatten them into a face patch merely to complete a preview.

If a mouth-shaped stain remains in the face base after replacing the detached mouth, prove its origin by viewing the base alone. A small, feathered repair may be made within the face base rather than adding an independent skin plate over the mouth. The optional `scripts/even_face_base.mjs` preserves alpha and limits RGB edits to a configured interior band; inspect the entire jaw contour and reject the result if it looks unnaturally flat. Never reuse another character's retouch coordinates.

## Miffy first-pass findings, not reusable coordinates

The Miffy task `Miffy_full_body_casual_rb_20260924_012138` is a concrete test case for this stage: the default backhair slot covered the white top; the first order candidate also put eyebrow below face and handwear above topwear. The extracted nose and mouth PNGs contain the objectionable dark outlines, while their alpha is localized rather than a broad opaque plate. The ear PNG contains two ears although the source occludes one; the neck/shoulder join still needs a character-specific repair. These facts trigger review, not an automatic global eraser or a claim that the model's hidden anatomy is correct. Use the source, local candidate screenshots, and separate PNGs to determine the actual visible ear side and where each mask should end.
