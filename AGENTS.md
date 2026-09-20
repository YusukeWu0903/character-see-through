# Project workflow

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
