# Project status — 2026-09-25

This is a checkpoint, not a claim that every character or motion is complete. Candidate labels below describe local review artifacts; a Git checkpoint or packaged page is not, by itself, a production approval.

## Stable foundation and release boundary

- The see-through wrapper generates isolated, full-canvas semantic RGBA layers, alpha diagnostics, and a clean PSD. The upstream model remains external through `SEE_THROUGH_HOME`.
- Eris has the earlier reviewed flexible viewer and versioned eye/seam assets. Its approved production settings are locked in `viewer/quality-baseline.json`; they do not automatically apply to Miffy.
- Miffy's earlier v21 interactive-showcase checkpoint is `b9b1472`. On 2026-09-25 the user accepted v40 as a **stage checkpoint**, not a claim that the character, expressions, or performance are finished. `site/miffy-demo/` now packages the exact v40 rig chain and runtime assets; remote deployment still requires the release checks below.

## Miffy progress

Task: `outputs/seethrough_local/Miffy_full_body_casual_rb_20260924_012138`. The original artwork, source layers, and prior candidates remain separate from the `_review/` experiments.

| Area | Current evidence | Status and next gate |
| --- | --- | --- |
| Static assembly | High-resolution bald-head replacement and hair; `full_head_v10` was accepted for static appearance. `seam_v2` was usable with some contour repair left to manual work; `cheek_outline_v1` addressed three cheek-line pixels. | Static review basis, not blanket approval of every later moving seam. |
| Standing body, idle, pointer | Grounded segmented sway and shared Eris-style idle/follow control semantics after v2–v6 corrections. | Local interactive review; joined arm and leg source layers still prevent independent limb articulation or foot IK. |
| Eyes and chest | Blink/gaze assets and a cleaned ear-root transition through v20; v19 chest field combines idle vertical and pointer-driven lateral response with a default-off guide derived from its actual influence. | Functional local candidates and user feedback; inspect moving eyelids, outlines, garment edges and combined extrema before final acceptance. |
| Hair and head yaw | Roll, curved-surface yaw, neck response, front/back hair inertia, and yaw-centered idle; v33 increases front-hair yaw follow after user feedback. | Limited 2.5D front-view illusion. It cannot reconstruct unseen side anatomy; moving hairline and reversals still need artistic review. |
| Head pitch and light | v36 curved endpoint-driven up/down pitch; v37 added signed pitch light; v38 doubled its strength and registered the light boundary to the current head image. v29 supplies the earlier upper-face yaw-light balance. | **v38 is pending visual acceptance.** Light-off and neutral A/B checks pass, but stronger light still needs user review in motion and at mixed yaw/pitch poses. |
| Hips and feet | v39 removes the visible ankle seam from its derived footwear layer, adds a modest hip translation and local tilt, and keeps the soles planted. | User said the result looked acceptable; derived candidate stays hash-pinned with v38 rollback. |
| Arms | v40 warps left/right regions of the shared arm PNG separately: shoulder fixed, upper arm small, forearm and wrist progressively larger. A default-off guide shows the actual affected region. | **User accepted this stage checkpoint on 2026-09-25.** It is still a bounded 2D pixel deformation, not independently articulated elbow bones or IK. Rapid reversals, occlusion and mobile smoothness remain future art/performance work. |
| Mouth and expressions | Earlier Miffy smile was explicitly rejected and removed; source expression images remain available. | Not built/accepted. Head pose is not a substitute for expression assets. |
| Public delivery | `site/miffy-demo/` is the v40 stage showcase with an explicit work-in-progress notice. The source candidate stays under task `_review/` and is not a new universal production preset. | Run the production quality contract, static-bundle browser check, and deployed real-browser check before sharing its cloud URL. |

The local, Git-ignored `_review/motion_v40/QA.md` records neutral pixel identity, arm-field bounds, guide checks and remaining limitations. Its background-browser diagnostic was about **13.2 FPS** versus about 14 FPS for v39; neither number proves smooth foreground or mobile playback. The earlier v38 pitch-light diagnostic was about 18 FPS in a different measured pose. Readers of GitHub alone will not have the task-local screenshots. The v21-era [animation plan](miffy-animation-plan-2026-09-24.md) records earlier decisions and rejected approaches, not today's completion status.

## Remaining work and workflow

1. Retain v40 as the stage checkpoint and revisit continuous motion on foreground/mobile devices, especially quick arm reversals, shoulder seams, hair/hand overlap and hip/ankle edges. The measured low FPS is an explicit optimization backlog; never reduce native source quality as a workaround.
2. Recheck head/neck/hair seams, eye transitions, chest/garment boundaries and mixed yaw/pitch lighting. Stage approval is not separate artistic certification of every earlier control extreme.
3. Plan source-faithful mouth and expression assets with a separate acceptance gate; do not revive the rejected smile by default. True independent arms/legs need new separations and hidden-area coverage.
4. For each cloud update, run `python quality_contract.py --task <task-directory>`, package the exact runtime assets, verify the deployed page in a real browser, and record the commit and URL. The public-release skills in `skills/` define that gate.

Reusable lessons now belong in `skills/character-motion-rig/`: use actual-field guides for any moving part, define sign and anchor behavior before building a warp, verify perceptibility at the intended viewport, and keep candidate parameters and rejected alternatives task-local. No Miffy-specific pixel coordinate or gain is a universal default.
