# Eris expression structure and first happy candidate

Date: 2026-09-23. Task: Eris_full_body_casual_20260918_113905.

## Sources and limits

- The original see-through project decomposes one static anime image into semantic, inpainted layers with inferred order. It is a source for editable parts, not an expression-animation rig: https://github.com/shitagaki-lab/see-through/blob/main/README.md
- Live2D recommends separate eyes, nose, eyebrows, mouth, face contour, and ears; eye whites can act as iris clipping material, and the mouth interior must not show when closed: https://docs.live2d.com/en/cubism-editor-tutorials/psd/
- Live2D treats smiling eyes, eyebrow pose, mouth form, mouth opening, blink, and gaze as separate parameters. Its expression guidance cautions against overwriting motion-controlled mouth opening and eye gaze; eye-open expression modifiers must preserve natural blink: https://docs.live2d.com/en/cubism-editor-manual/standard-parameter-list/ and https://docs.live2d.com/en/cubism-editor-manual/create-facial-expressions/ and https://docs.live2d.com/en/cubism-editor-manual/setting-and-exporting-facial-expressions/
- Spine slots hold alternate attachments, with the slot under a parent bone; skins and keyed slots can group visual variants without replacing the whole character: https://us.esotericsoftware.com/spine-attachments and https://us.esotericsoftware.com/spine-skins

These are structural principles, not a claim that this viewer runs Cubism or Spine.

## Eris-specific decision

- Use emotion_type_bd.jfif for face features, never the hair-bearing sheet. Hair remains the existing top-most independent layer.
- Do not paste an entire face. Use source- and target-measured eye anchors, then isolate each changed feature. The current approved split-eye, gaze, and closed-eyelid assets stay intact unless a separate reviewed eye candidate passes the eye-rig contract.
- The first happy candidate changes only the two eyebrows from the bald sheet. Selecting it suggests the already reviewed sheet-derived smile mouth, but mouth selection and lip playback remain independent. Nose, eye whites, irises, open lashes, closed eyelids, and face contour stay as they were.
- The measured source eye midpoint (700,310) maps to target (640,158) with uniform scale 0.43 for the eyebrow source crops. Both brows use the same transform; no independent left/right stretching. This is an initial measured registration requiring moving-viewer visual acceptance.
- Preserve full 1280 by 1280 transparent candidate assets, source hashes, source crop coordinates, a visible candidate label, and the previous candidates for comparison and rollback.

## Review gate

Check neutral versus happy at face zoom; front hair on/off; gaze left/right; open, half, and full blink; and mouth neutral/smile plus automatic playback. Look for double brow lines, pale skin patches, lash occlusion, hair contamination, eye drift, and jaw seams. Numeric alignment and passing tests do not establish visual approval.

Candidate report: outputs/seethrough_local/Eris_full_body_casual_20260918_113905/_rig_candidates/facial_happy_v1/report.json. Do not promote or deploy before user acceptance. If happy eyes need a different contour, create a separate reviewed eye-attachment candidate rather than editing the approved eye assets in place.
## Angry candidate (2026-09-23)

- The user's hairless sheet labels row 1, column 4 憤怒. This is the chosen angry reference, not the separate 厭惡 cell.
- Reproducible builder: build_facial_angry_candidate.py. It uses hand-bounded crops from emotion_type_bd.jfif and the same eye-anchor registration concept as the happy candidate. The new candidate-only assets are eyebrow_angry.png and mouth_angry.png under facial_angry_v1. The other six mouths and mouthless head seam are copied from facial_sheet_v2.
- Selecting angry defaults to the source pressed mouth. The mouth dropdown remains independent; existing approved split-eye, gaze, and blink assets are unchanged. No whole-face or hair-bearing crop is used.
- The source eyebrow line is extremely thin at 0.43x scale. The outer edge may still appear slightly dotted at face zoom; front-hair overlap and animated poses require user visual review. Do not claim exact reproduction of the reference's narrowed eyes until an independent expression-eye attachment passes the eye-rig review gate.
- Candidate-only URL: http://127.0.0.1:8013/preview-secondary?local=Eris_full_body_casual_20260918_113905&face-candidate=facial_angry_v1&view=face. Not approved or deployed.

## Angry brow correction (2026-09-23)

User rejected facial_angry_v1's visibly jagged brow. Its hand mask traced only a narrow upper ridge from the hairless sheet's row 1, column 4 憤怒 cell, and Pillow affine bicubic sampling did not low-pass the thin line while shrinking to 0.43x. The result did not match the source brow. V1 is superseded and its report is marked rejected_by_user_jagged_brow.

facial_angry_v2 uses the full sloped eyebrow wedge, including source shading but excluding the dark eyelash body. The builder now downsamples the transparent original-pixel crop with LANCZOS before placement; it does not redraw the brow. Full-canvas eyebrow and mouth candidates remain independent from approved eye whites, irises, open lashes, closed lids, gaze and blink. Local face-zoom review with front hair on and temporarily off showed a continuous brow without V1's conspicuous dotted edge. The hair-off view also exposes pre-existing forehead inpainting beneath the hair, not a candidate brow artifact. V2 still needs user review in moving poses; no promotion or deployment.

## Angry mouth v3 and combined showcase candidate (2026-09-23)

User reported that the v2 angry mouth looked off-center and carried a skin-colored halo distinct from the cheeks. The source sheet's painted mouth has a dark-pixel midpoint near x=1603, while the shared face registration uses x=1600. facial_angry_v3 shifts the mouth texture two target pixels left. Its alpha is inferred only inside the manually bounded source-mouth ellipse from local darkness relative to nearby source skin rows, so the source sheet's broad peach skin patch is transparent and the approved face supplies the visible skin. Source lip RGB is preserved; no new mouth is drawn. The candidate-only mouth alpha footprint shrank from 348 to 102 pixels above alpha 8; this numerical fact does not prove appearance alone. Local and external-tunnel WebGL face views were inspected; the line looked centered and the gross skin halo was not visible in sampled frames. User acceptance remains pending.

For eventual showcase release, facial_showcase_v1 combines the six facial_sheet_v2 mouths, facial_happy_v1 brow, and facial_angry_v3 brow and pressed mouth into one candidate. It offers original, happy, and angry expressions with independently selectable mouths and retains approved split eyes, gaze, blink, and seams. It contains no v1/v2 angry assets. A temporary HTTPS tunnel loaded all three modes with no failed runtime resources; this is a preview, not approval for permanent publication.

A separate half-body illustration is a plausible future quality improvement for closeups, but the user has only raised it for consideration. It would require separate layer extraction/rigging and a controlled swap at view transition. No second illustration, automatic switch, or production specification change is part of this candidate.
