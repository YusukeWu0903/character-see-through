# Project workflow

## Clarify consequential ambiguity before production work

Before changing a character, animation, image, viewer behavior, SKILL, or public delivery, ask only if the direction is unclear, a consequential detail is missing, or the agent would add a design the user did not specify. Then offer 2–3 concrete options, recommend one, and ask the user to choose or correct them; describe visible differences and review states, including viewer-left/right and negative/zero/positive controls when relevant. Do not implement the unresolved interpretation while waiting; read-only research can continue. Record the clarified acceptance examples in task QA and test them before presenting a candidate. If the request is clear, proceed without redundant confirmation. Pure questions and status checks do not need a menu.

For requests involving see-through inference, alpha cleanup, PSD export, viewer
comparison, or sharing a generated character, read
[`skills/see-through-local/SKILL.md`](skills/see-through-local/SKILL.md) before
changing files or starting an inference run.

Keep outputs inside this repository. The upstream see-through checkout is an
external dependency selected through `SEE_THROUGH_HOME`; do not modify it
unless the user explicitly authorizes it. Record any approved upstream delta in
`patches/`.

# Production specification safety

Before changing inference defaults, viewer quality, approved assets, or any
test accommodation, read `viewer/quality-baseline.json` and
`docs/spec-change-policy.md`.

- Never reduce or alter the production baseline as a side effect of debugging,
  performance, memory, or test work.
- A temporary deviation must use a named, visibly labelled non-production
  profile. Never put that profile in a user delivery URL.
- Changing the production baseline requires the user's explicit approval and a
  new decision record under `docs/spec-decisions/`.
- Run `python quality_contract.py` before handoff. For generated-character
  delivery, also pass `--task <task-directory>`. Any failure blocks delivery.

# Shared daily work log

For a material output, optimization, test result, decision, rollback, or
user-approved milestone, read [`skills/daily-work-log/SKILL.md`](skills/daily-work-log/SKILL.md)
and append the project entry to the shared dated log before handing off. Keep
all projects changed on the same date in the same file; never overwrite another
project's entry or create an empty log when nothing material changed.

# Reusable cross-agent skills

All agents must read the matching `skills/<name>/SKILL.md` before acting on its workflow. These files are platform-neutral; Claude, Hermes, and other agents should follow the same contracts through their own tools.

Before each new character-production stage, inventory the task's existing source layers, candidate assets, scripts, and matching SKILL. Follow and test the established route first. If no SKILL covers that stage, create and validate a focused reusable SKILL before implementing it; if the established route fails on this character, preserve the failure evidence and improve that SKILL instead of silently starting a parallel workflow. Keep character-specific coordinates and artistic decisions in the task, not as universal defaults.

- `portfolio-interactive-showcase`: public static/Vercel/GitHub Pages character showcase packaging.
- `eye-rig-asset-promotion`: split-eye, gaze, and eyelid asset changes or promotion.
- `seam-repair-promotion`: neck/shoulder seam candidate review or default activation.
- `character-assembly-repair`: second-stage part tree, draw-order, face/occlusion, and seam candidate repair before rigging.
- `character-motion-rig`: character-specific full-body/hair/chest and facial animation after assembly review; includes independent motion and expression acceptance gates.
- `character-expression-transplant`: source-drawn mouth and expression registration, feature-free backing, switching, and interactive acceptance after assembly/eye candidates.
- `interactive-showcase-release-check`: any final public showcase delivery or URL update.
