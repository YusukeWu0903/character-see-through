# Visual influence review for moving parts

Use this gate for every new or revised moving part after the assembly and its source-layer ownership are known. Miffy's chest review showed that a visible guide derived from the real deformation field makes boundary and amplitude changes measurable. Transfer the review method, not Miffy's grid spacing, coordinates, weights, or motion values.

## Choose a truthful guide

| Motion representation | Review guide | Do not imply |
| --- | --- | --- |
| Weighted mesh or sampled pixel warp | Actual vertices or sampled weight grid, zero-weight contour, anchors, and optional displacement vectors at the tested pose | A sampled grid is an editable vertex mesh, or every colored pixel moves equally |
| Rigid part or bone hierarchy | Pivot, joint, parent link, path/extreme silhouettes, and the actual skinning/occlusion boundary | A rigid transform has a local deformation field |
| Masked facial part or sprite swap | Actual mask edge, registration landmarks, crop bounds, and occluding layers | A face/eye/mouth needs a chest-style mesh |

Compute the guide from the same evaluator, coordinates, manifest and source mask used by the motion, never from a second hand-drawn rectangle. Place it in the owning part's draw slot, through the same parent transforms and clipping, so foreground hair, arms and clothing occlude it normally. Offer solo-layer and assembled views when the field is hidden by another part. Label weight/influence separately from actual displacement; a weight footprint can remain visible even while amplitude is zero. Keep the switch in review controls, default off, and never bake the guide into source art, PSD, approved assets, or a public export.

## Calibrate one part at a time

1. Pin the candidate to the exact source/assembly manifest and verify that neutral pixels match the reviewed assembly. Record the owner, motion type, coordinate units, anchors, actual support region, rollback candidate and review status.
2. At native resolution and the intended viewing scale, enable the guide in solo and assembled views. Inspect the actual boundary, occlusion, joints, ground contact and neighboring seams. Adjust ownership, anchors, extent and falloff before increasing amplitude. For a warp, taper smoothly to zero; for rigid joints, check the real pivot/path instead of inventing a weight field.
3. Test each driver alone, then combined: idle, pointer follow, manual controls and any secondary spring. Compare neutral, positive/negative extrema, intermediate frames, reversal, pause, reset and return to neutral. Inspect both shape and timing; a mathematically valid field can still look wrong.
4. Verify by representation: warped pixels outside the declared field stay identical, boundary displacement reaches zero, and the map does not fold where applicable; rigid parts retain intended attachment/contact; masked sprites do not reveal baked duplicates or stray pixels. Toggle the guide off and confirm the original canvas returns exactly. Check performance with the guide off and on, but do not lower production image quality to pass.
   For interactive pixel warps, measure both steady playback and continuous control scrubbing; a cached fixed pose can conceal a slow angle update. Profile which field owns the cost before changing the algorithm. Reuse static source pixels and unchanged rendered results, or evaluate an inverse field on a measured interpolation grid, while retaining native output resolution and approved geometry. A faster sampler needs a candidate-only A/B against the previous renderer at neutral, intermediate and opposite extrema, including alpha edges and combined part motion; record pixel deltas and actual timing separately. Do not treat a higher background-tab FPS or a changed hash alone as visual approval.
5. Save native/zoomed screenshots or a short recording, actual guide measurements, tests, visible defects and unresolved artistic questions in the task candidate's QA. Keep character-specific grid sizes, coordinates and gains there, not in this SKILL. Promote each part only after the user has reviewed its actual motion; passing another part's guide or automated checks is insufficient.

For head rotation and independently moving limbs, visualizing a footprint cannot supply missing side art, hidden anatomy or separate source layers. Mark the control unavailable until those prerequisites are met. Use [body motion](body-motion.md) for stance and chest mechanics and [facial motion](facial-motion.md) for eye/expression-specific gates.
