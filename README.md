# Auto-Layering Pipeline

This repository turns a single anime-style character illustration into aligned
semantic RGBA layers and a PSD, then supplies local review and a non-destructive
2D motion-preview prototype. It is an automation and quality-control layer
around [Shitagaki Lab's see-through](https://github.com/shitagaki-lab/see-through),
not a fork or redistribution of that upstream project.

> Current baseline: clean local RGBA/PSD delivery and the Eris flexible preview
> have reached the project's initial acceptance target. Miffy's user-accepted v50
> checkpoint adds six source-drawn mouths and shared GPU deformation/lighting,
> fixing flashing mesh seams and improving head-scrub performance. See the [current project status](docs/project-status-2026-09-26.md)
> for what is working, pending, and not yet built.

## What is delivered

For every local run, `run_seethrough_local.py` creates an isolated directory:

```text
outputs/seethrough_local/<task>/
├── *.png                    # 17 aligned, full-canvas RGBA semantic layers
├── _order.json              # layer names and composition order
├── _alpha_validation.json   # cleanup and review statistics per layer
├── _alpha_checkerboard.png  # transparency inspection composite
├── _previews/               # layer thumbnails
└── <input>_clean.psd        # PSD written directly from verified RGBA layers
```

The PSD is produced by `dev_psd_write.py` from cleaned, verified PNGs. It does
not use the upstream `--save_to_psd` path.

## Setup and first run

Install see-through separately, then point this repository at that checkout:

```powershell
$env:SEE_THROUGH_HOME = 'C:\path\to\see-through'
python run_seethrough_local.py 'inputs\character.png'
python main.py
```

Open `http://127.0.0.1:8010/preview?local=<task-name>` after the run. The
quality defaults are 1280 LayerDiff resolution, 30 inference steps, and 768
depth resolution. On a 12 GB GPU, the two-stage run may take over an hour.

## Quality contract

LayerDiff can bake an opaque grey/white plate into individual layers. The
cleanup code removes only confirmed neutral background connected to the canvas
edge; it does not erase all grey pixels, because grey clothing, shadows, and
inpainted regions are meaningful artwork.

Accept a run only when all three checks pass:

1. `_alpha_validation.json` has no unresolved review flags.
2. `_alpha_checkerboard.png` has no residual opaque background plate.
3. Local-versus-reference review has no unacceptable regression in outlines,
   face/mouth, limbs, feet, registration, or composition order.

For a barefoot character, a nearly empty `footwear` layer can be semantically
correct. Assess the final composite rather than assuming missing footwear means
missing feet.

## Review and preview pages

| Page | Use | Status |
|---|---|---|
| `/preview?local=<task>` | Cloud/reference and local layer comparison | Primary quality gate |
| `/preview-rig?local=<task>` | Parent-child rig prototype | Development review |
| `/preview-deform?local=<task>` | Shared neck/waist deformation inspection | Development review |
| `/preview-secondary?local=<task>` | Blink, gaze, secondary motion, and seam candidates | Eris-focused experimental review |
| `/viewer-assets/assembly-review.html?local=<task>&manifest=<candidate>` | Task-specific static assembly | Local candidate review |
| `/viewer-assets/assembly-motion.html?local=<task>&rig=<candidate>` | Task-specific interactive motion | Local candidate review; not a release URL |

The flexible side of the deformation preview is the presentation mode. The
rigid side is a diagnostic baseline for registration and order; it deliberately
locks the head group to the torso because this decomposition does not contain
enough hidden neck fill for an independent rigid head turn.

Viewer controls never alter source PNGs, PSDs, Alpha reports, or upstream
models. Front-view yaw is only a conservative 2D cue, not real 3/4 artwork.

## Eye, seam, and secondary-motion assets

- Closed eyelids are versioned task-local assets. Only an explicitly reviewed
  and promoted candidate is loaded by default; rejected experiments remain
  separate for rollback.
- The eye rig uses one shared cursor/manual gaze vector for both irises. Each
  iris is clipped by its matching eyewhite Alpha at the translated destination;
  conservative common limits and per-eye blink centres are measured into the
  task-local manifest. See [`docs/eye-rig.md`](docs/eye-rig.md).
- `seams_v2` is an explicit Eris seam-repair candidate, split into head-bound
  and torso-bound patches. It requires per-character visual review and is not
  a universal repair.
- Eris and Miffy have separate character-specific motion candidates. Miffy has
  reviewed local trials for grounded idle/follow, blink/gaze, a visualized
  two-axis chest field, bounded head motion and lighting, hip motion, and
  side-to-side arm sway. v50 was accepted as a stage checkpoint, not as a
  final anatomical or performance standard. None is a general Live2D-quality
  or 3D simulation.
- Miffy's rejected smile was removed. Six source-drawn mouth shapes and a silent
  talk demo are available; audio lip-sync and broader expressions are not complete.
  Head pose must not be described as a complete expression rig.

## Testing

```powershell
python quality_contract.py
python quality_contract.py --task outputs/seethrough_local/<task-name>
python -m pytest tests/test_seethrough_alpha.py -q
node --test tests/test_rig.mjs tests/test_deformation.mjs tests/test_expression.mjs tests/test_renderer_alpha.mjs tests/test_quality_profile.mjs
python validate_eye_rig.py outputs/seethrough_local/Eris_full_body_casual_20260918_113905
node tests/check_eye_rig_browser.cjs
```

Tests prove implementation contracts. Always perform checkerboard and rendered
visual review before calling character artwork accepted.

Production defaults are locked in `viewer/quality-baseline.json`. Test or
memory accommodations must use a named, visibly non-production profile and
cannot silently replace the normal viewer settings. See
[`docs/spec-change-policy.md`](docs/spec-change-policy.md).

## Temporary sharing

Localhost is visible only on the host PC. For an approved temporary external
review, use the restricted sharing server and an HTTPS tunnel. Cloudflare Quick
Tunnel is suitable for short-lived LINE review links; it is not durable hosting
and the link stops working when the host or tunnel stops. Do not expose PSDs,
arbitrary tasks, project files, or credentials through a quick share.

## Skills and daily handover

`AGENTS.md` directs see-through work to
[`skills/see-through-local/SKILL.md`](skills/see-through-local/SKILL.md), which
defines task isolation, Alpha/PSD rules, and acceptance checks.
The [motion-rig skill](skills/character-motion-rig/SKILL.md) routes body,
face, and deformation-field review; the [dated Miffy plan](docs/miffy-animation-plan-2026-09-24.md)
preserves earlier decisions. The [current status](docs/project-status-2026-09-25.md)
supersedes that plan's v21 progress snapshot without rewriting its history.

Any material project outcome must also follow
[`skills/daily-work-log/SKILL.md`](skills/daily-work-log/SKILL.md). The shared
daily record is one file for all projects changed that day:

```text
D:\Project\AI_Daily_Work_Log\YYYY-MM-DD_OpenAI-Codex.md
```

Entries record artifacts, verification, decisions, limitations, and Git
milestones without overwriting other projects' notes.

## Upstream boundary and attribution

- Upstream research/model: Jian Lin et al.,
  [see-through](https://github.com/shitagaki-lab/see-through) (Apache-2.0).
- This repository does not include upstream source or model weights. It does
  include selected character-derived runtime artwork inside packaged showcase
  bundles such as `site/miffy-demo/`; the original inputs and task-local PSDs
  are not part of those bundles. Confirm display rights before publishing or
  redistributing a character, and follow upstream licence/model terms.
- `SEE_THROUGH_HOME` selects the user's separate upstream checkout. Do not
  modify it unless explicitly authorized; record every approved delta under
  `patches/` and validate it in this repository.

## Repository map

```text
run_seethrough_local.py    inference orchestration, isolation, Alpha validation
dev_psd_write.py           direct clean-RGBA PSD export
main.py                    local review server
share_viewer.py            restricted temporary review surface
viewer/                    rig, deformation, expressions, and rendering
derive_*.py                task-local eye/head/seam asset derivation
tests/                     Alpha/PSD, rig, deformation, expression tests
docs/                      design, validation, feedback, and status audit
skills/                    portable project workflow skills
patches/                   approved upstream-delta records
```
