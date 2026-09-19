# Eyelid production and acceptance

## Current state

The flattened-character reference pipeline is rejected for production. Its
latest output has visible stray eye contours. Commit cb58b90 provides clipping
checks, not a visually accepted blink. Zero overlap with hair/brows does not
prove that copied RGB pixels contain no hair or that the old eye is covered.

The hairless head base has been inspected: the separated face can itself
contain unwanted contours and forehead shading. Excluding hair layers is not
sufficient to certify a clean drawing base.

## Required automated sequence

1. Assemble the task's face and facial features without front/back hair;
   retain source hashes, canvas dimensions, composition order, and crop transform.
2. Inspect the face base and identify the complete original eye footprint,
   including lash pixels and any eye contours baked into the face layer.
3. Generate closed-eye artwork from this hairless base. Preserve eyebrows,
   nose, mouth, pose, shading and canvas registration. Save as a new candidate.
4. Register the candidate using unchanged facial areas, never independently
   stretching each eye crop. Reject excessive residual drift. Preserve a
   continuous skin replacement covering the complete old eye, not a sparse
   RGB-difference mask that leaves old outlines exposed.
5. Export full-canvas RGBA assets to a versioned candidate directory. Check
   dimensions, alpha, coverage, feathering, brow preservation and source hashes.
6. Render the actual viewer at 0%, 25%, 50%, 75%, 100% closure, including
   enlarged face crops and a motion sequence. Inspect for old outlines,
   double lines, pale patches, disappearing brows, seams and facial drift.
7. Record visual review separately from numeric checks. Only a reviewed
   candidate may receive closedEyelids.visualReview.status = passed and
   source = approved_artwork. A generator must not approve its own output.
8. Promote the reviewed version atomically, retaining the previous manifest
   and assets for rollback. Record user feedback without treating a numeric
   pass as user approval.

## Failure behaviour

The viewer retains open eyes if no visually accepted eyelids are available.
Other character motions remain enabled. Missing image-generation access is a
blocked production step; do not reuse the rejected flattened reference and
describe it as newly generated hairless-head artwork.

This document specifies the intended pipeline. Registration, new artwork and
rendered visual acceptance remain unfinished; they are not implemented merely
by documenting them here.
