# Auto-Layering Pipeline

This repository turns a single anime-style character illustration into aligned
semantic RGBA layers and a PSD, then supplies local review and a non-destructive
2D motion-preview prototype. It is an automation and quality-control layer
around [Shitagaki Lab's see-through](https://github.com/shitagaki-lab/see-through),
not a fork or redistribution of that upstream project.

> Current baseline: clean local RGBA/PSD delivery and the Eris flexible preview
> have reached the project's initial acceptance target. See the detailed
> [current capability audit](docs/project-status-2026-09-20.md) for evidence,
> decisions, and limitations.

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
- `seams_v2` is an explicit Eris seam-repair candidate, split into head-bound
  and torso-bound patches. It requires per-character visual review and is not
  a universal repair.
- Chest follow-through is experimental and currently paused for further
  tuning. A previous high-amplitude mesh approach was rejected because it tore
  unmatched skin and clothing layers. Do not represent the current preview as
  a Live2D-quality body simulation.

## Testing

```powershell
python -m pytest tests/test_seethrough_alpha.py -q
node --test tests/test_rig.mjs tests/test_deformation.mjs tests/test_expression.mjs tests/test_renderer_alpha.mjs
```

Tests prove implementation contracts. Always perform checkerboard and rendered
visual review before calling character artwork accepted.

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
- This repository does not include upstream source, model weights, or character
  artwork. Follow the upstream licence, model terms, and citation requirements.
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
