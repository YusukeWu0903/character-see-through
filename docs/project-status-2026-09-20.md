# Auto-Layering Pipeline — current capability audit

Date: 2026-09-20  
Project: `D:\Project\auto_layering_pipeline`  
Current development branch: `codex/eyelid-secondary-motion-v5`

## Purpose and boundaries

This repository is the automation, validation, export, inspection, and
animation-preview layer around Shitagaki Lab's **see-through** research
project. It is not a redistribution of the upstream source, models, or
character material. The external upstream checkout is selected with
`SEE_THROUGH_HOME`; repository changes must not alter it without explicit user
authorization and a recorded patch under `patches/`.

The current validated character case is
`outputs/seethrough_local/Eris_full_body_casual_20260918_113905`. It is an
isolated run, not a general claim that every character will produce identical
quality.

## 1. Local semantic-layer production

`run_seethrough_local.py` is the main entry point. It stages every input with a
unique name and writes each run to a unique `outputs/seethrough_local/<task>/`
directory, so files from earlier batches cannot contaminate a new result.

The retained output contract is:

- 17 full-canvas, canvas-registered semantic RGBA PNG layers;
- `_order.json` for stable layer order;
- `_alpha_validation.json` for machine-readable per-layer cleanup and review
  data;
- `_alpha_checkerboard.png` and `_previews/` for visual inspection;
- a `<input>_clean.psd` exported from the verified PNGs.

The pipeline uses the upstream quality-oriented defaults (1280 LayerDiff,
30 inference steps, 768 depth). A full GPU run can take more than an hour; a
long run is not treated as failed merely because individual head-layer files
have not appeared yet.

## 2. Alpha cleanup and PSD integrity

The pipeline explicitly addresses LayerDiff's grey/white opaque background
plates. Cleanup is based on confirmed neutral regions connected to the canvas
edge, not a global grey threshold or source-image colour difference. This
preserves grey clothing, shadows, accessories, and inpainted hidden regions
where possible.

Each layer records pre/post cleanup statistics and suspicious opaque edge
regions. A numerical alpha pass is not treated as an appearance pass: the
checkerboard and local-versus-cloud viewer comparison remain required.

The delivered PSD is written directly from the cleaned, verified RGBA PNGs by
`dev_psd_write.py`; upstream `--save_to_psd` output is not the deliverable.
This prevents an intermediate upstream PSD writer from discarding Alpha.

Current regression coverage includes edge-connected background removal,
preservation of internal grey pixels, PNG Alpha retention, and PSD Alpha
round-trip checks.

## 3. Review, comparison, and sharing

`main.py` serves the local review pages. `/preview?local=<task>` compares the
local task to the cloud/reference layer set. It is the primary visual gate for
residual plates, hair/arm halos, facial or mouth seams, legs, feet, layer order,
and canvas registration.

`share_viewer.py` provides a deliberately restricted temporary sharing surface
for the approved Eris task: it exposes only the viewer assets and allowed PNG/
JSON data, not PSD files or arbitrary project paths. Cloudflare Quick Tunnel
was selected over LocalTunnel because LocalTunnel can present recipients with an
IP-entry abuse-warning page. A Quick Tunnel is temporary, tied to the running
host, and is not durable deployment.

## 4. Hierarchical motion and deformation prototype

The project has a non-destructive viewer-only hierarchy:

```text
root
└─ body
   ├─ torso: topwear / neck / handwear
   │  └─ head: face and facial parts
   │     ├─ frontHair
   │     └─ backHair
   └─ legs: bottomwear / legwear / footwear
```

`viewer/rig.mjs`, `motion.mjs`, and `eris-deform.json` establish bounded parent
transforms. The preview supports neutral reset, idle movement, pointer follow,
calibration, per-task local settings, import/export, and an upper-body review
view. Zero-input pose is required to return to the original registration.

`viewer/deformation.mjs` and `mesh-renderer.mjs` add shared waist/neck
transition fields so adjacent flexible layers use the same coordinates instead
of separating at the joint. The soft/flexible side is the presentation mode.

The rigid side is now a **diagnostic baseline**, not a fake independent
head-turn. The current decomposition lacks enough hidden neck fill to rotate a
separate rigid head without a false broken-neck artifact. In rigid mode the
whole head group is locked to the torso; it remains useful for checking raw
layer registration and order without presenting an impossible joint pose.

## 5. Eye assets and blink pipeline

The eye work moved from a rejected flatten-and-crop approach to a versioned,
hairless-head workflow:

1. Assemble an inspected head base without front/back hair.
2. Produce full-canvas left/right closed-eyelid assets from that artwork.
3. Validate registration, canvas dimensions, Alpha, brow preservation,
   coverage, and source hashes.
4. Render 0/25/50/75/100% closure for visual review.
5. Promote only an explicitly user-approved candidate atomically, while
   preserving the previous manifest and assets for rollback.

The approved `hairless_v3` assets are versioned inside the Eris task and loaded
through `_rig_assets/eye_assets.json`. The renderer correctly fades
premultiplied RGB and Alpha together, preventing white cards during a blink;
eyebrows are ordered above the closed-eye paint and front hair stays foreground.

Known limit: intermediate crossfade can still show mild ghosting. Passing Alpha
or registration checks does not alone certify a natural blink for another
character.

## 6. Shoulder and neck seam work

`derive_seam_repair.py` registers the original source image to the task and
creates tightly bounded seam-repair patches. Candidate `seams_v2` separates
head-bound and torso-bound repair assets, avoiding the earlier rigid face tear
caused by attaching one mixed patch to the torso.

After user review, `seams_v2` is promoted through
`promote_seam_candidate.py` into a versioned Eris-only `seam_assets.json`
manifest and loads by default. It is not a universal repair for other inputs.
Some shoulder line-art remains part of the original artwork rather than a
detachable compositing seam. Each future character still needs its own
registration, visual review, and acceptance decision.

## 7. Secondary chest motion

The viewer contains an experimental, low-to-moderate chest follow-through
control. It is driven by torso/body weight shift and optional pointer-follow,
not by an independent periodic bounce. The control changes amplitude; without
body or pointer motion it remains still.

An earlier high-amplitude local-lobe mesh trial was rejected and reverted
because it exposed unmatched body/clothing fills and produced triangular tears.
The current work must not be described as a Live2D-quality breast simulation.
Further chest work was paused by user direction. On 2026-09-23 the user
requested pointer-driven motion. The first restoration attempted opposing
left/right signals and broad garment/skin mesh scaling; the user rejected it
because leftward pointer motion squeezed the chest inward and warped both arms.
It was replaced with same-direction pointer follow-through on a localized,
edge-anchored chest patch. The garment and central chest skin share the patch,
while the skin mask narrows before the shoulders and arms. A still narrower
skin-mask trial was also rejected because it reopened neckline
gaps. The high-amplitude local-lobe mesh remains reverted. Native-resolution
WebGL frames
at maximum strength were reviewed in both pointer directions; this is a 2D
preview effect, not an independent Live2D rig or user artwork acceptance.

## 8. User-facing controls and their scope

Viewer controls affect only the canvas preview. They do not edit source PNGs,
the delivered PSD, the upstream model, or a task's validated Alpha report.
The controls include body/torso/head pose, breathing, hair, energy, chest
follow-through, yaw cue, gaze, blink, idle, pointer follow, pause, comparison,
and upper-body view. Values are bounded, and the visual animation ranges were
narrowed after user review.

The positive/negative head and body movement is still a 2D front-view cue, not
a generated three-quarter view. Real turn-around, limb IK, foot locking,
physics, and separate left/right limb control require additional semantic
layers and hidden-area artwork.

## 9. Verification evidence

The following checks are part of the active implementation:

- `python -m pytest tests/test_seethrough_alpha.py -q` for Alpha/PSD rules;
- `node --test tests/test_rig.mjs tests/test_deformation.mjs
  tests/test_expression.mjs tests/test_renderer_alpha.mjs` for hierarchy,
  coordinate continuity, expressions, and premultiplied compositing;
- real Chromium/WebGL rendering for module MIME type, loaded assets, visible
  canvas, max-pose inspection, and public-link reachability;
- manual review of checkerboard, cloud/local comparison, face/eye closure,
  neck/shoulder seams, and rendered extreme poses.

Automated tests establish contracts; user visual review is the acceptance gate
for artwork quality.

## 10. Version-control milestones

The clean local-layer baseline is `milestone/clean-layers-v1` at `deab315`.
The motion/quality branch preserves incremental commits rather than using
destructive resets. Recent milestones include:

- `6eec959` — approved versioned hairless eyelids integrated;
- `763abf0`, `362657b` — restricted public share and correct JavaScript MIME;
- `1fdc45f`, `acc13c7` — registered shoulder/neck seam candidate split by
  head and torso binding;
- `aa082a1`, `6920132` — rejected high-amplitude chest mesh and explicit
  rollback;
- `db6bf98`, `6b6855d` — pose-driven chest follow-through experiments;
- `c49fabd` — rigid head group locked to torso to eliminate the impossible
  broken-neck diagnostic pose.

## 11. Practical next steps

1. Treat flexible preview plus the clean PSD/PNG deliverable as the usable
   baseline; keep rigid comparison as developer-facing inspection.
2. Promote seam repair only after per-character visual review, not by copying
   Eris coordinates.
3. Build reusable character templates only after testing at least three
   materially different characters.
4. For expressive head turns, limbs, and stronger secondary motion, create
   semantic sublayers and hidden-area fill rather than increasing mesh force.
5. Keep the upstream checkout external; record any future authorized upstream
   delta in `patches/`.
