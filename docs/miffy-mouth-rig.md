# Miffy source-drawn mouth candidate

Current review: `motion_v45`, assets `mouth_v2`, rollback `motion_v43`.
The user accepted the six shapes and subsequently approved publication of the
v50 checkpoint that inherits these assets. The source candidate flags stay
unchanged for hash integrity; the public release record is separate.

The user supplied `Character/002_Miffy/mouth_type.png` (1536 × 1024).
Its top row is closed lips / slightly open / A; bottom row is E / O / U.
The user chose a manual selector plus a silent automatic talk demonstration.
Original mouth is the default; the demo defaults off. Manual selection disables
the demo; pause freezes it; reset restores original mouth with demo off.
The demo cycles source shapes and does not follow audio or claim phoneme sync.

`build_miffy_mouth_candidate.py` uses the established
`skills/character-assembly-repair/scripts/transplant_face_part.mjs` extractor.
Eye landmarks and a mouth-midline adjustment are recorded in task registrations.
Only source lip/oral artwork is transplanted, not ears, brows, hair or sheet skin.
A locally sampled, tapered mouthless backing replaces the baked original lips.
Mouth and eye artwork are composed before the existing head surface and light.
Switches are discrete, with no unverified mouth crossfade or new expression system.

Preserved failed trial: `motion_v44` / `mouth_v1`. Fixed cheek endpoints crossed
the narrowing jaw below the lips, producing a dark chin stripe. `mouth_v2` uses
checked, opaque skin samples on those lower rows. No old candidates were deleted.
The new rig flattens the effective v43 inheritance without changing its settings,
avoiding an additional dependency-depth failure.

Verification: six distinct shapes, no changed neutral pixels versus v43,
no changed pixels outside the declared local mouth owner, all six automatic
demo states, pause/manual override/reset, and ±50/0 yaw-pitch combinations
with half blink and extreme gaze. Native full-canvas assets remain 1280 × 1280.
Dark/light enlarged sprite review and assembled face review were performed;
machine checks are not artistic acceptance.

Evidence: task `_review/motion_v45/browser_qa.json`, face crops,
`_review/mouth_v2/qa_contact.png`, asset/registration hashes in its manifest.
Run `node tests/check_miffy_mouth_browser.mjs` and
`python quality_contract.py --task outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138`.
