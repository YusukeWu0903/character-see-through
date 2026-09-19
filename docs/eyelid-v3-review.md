# Hairless candidate v3 review

The built-in generator successfully used the attached hairless head crop.
The generated reference is saved inside the task as
`_rig_candidates/head_closed_generated_v3.png`.

Prompt: edit only both eyes to naturally closed eyes; replace the complete
old eye opening and outlines with matching skin and single lash curves;
preserve eyebrows, nose, mouth, ears, forehead shading, background and framing;
do not add hair, duplicate contours, white patches or rectangular seams.

`derive_hairless_eyelids.py` stages globally registered candidates without
overwriting active assets. Record the crop explicitly, e.g. for this existing
inspection crop: `--crop 540 80 740 230 --version hairless_v3`.
The source crop size must match; these coordinates are not reusable defaults
for other characters. Automatic crop preparation remains future work.

The assistant inspected `hairless_v3/review_strip.png` at 0%, 50%, 100%.
The fully closed composite no longer shows the rectangular eyelid seams and
retains the eyebrows. The 50% frame shows crossfade ghosting and is NOT accepted
as a natural half blink. Browser motion inspection remains outstanding.

Candidate URL parameter: `eyelid-candidate=hairless_v3`. This is a preview-only
opt-in. It does not set visualReview.status to passed or promote the assets.
The default view retains open eyes until reviewed assets are available.

## User-approved integration

The user subsequently approved this candidate for integration: 「做的很好了 可以實裝了」.
Use `promote_eyelid_candidate.py TASK hairless_v3 --approval "approval record"`
only after actual approval. It validates source hashes and RGBA dimensions,
copies assets to a uniquely versioned directory, saves the previous manifest,
and switches the active manifest atomically. Default preview URLs load that
version without a candidate parameter. Intermediate-frame crossfade ghosting
remains recorded as a known limitation; user acceptance does not erase it.
