# Production specification change policy

The production baseline is a safety boundary, not a tuning suggestion. It is
stored in `viewer/quality-baseline.json` and checked by
`quality_contract.py`.

## Rules

1. Reliability, performance, testing, debugging, and memory work must not
   silently reduce production resolution, inference steps, approved assets, or
   visual features.
2. A temporary deviation must be a named `nonProductionProfiles` entry. The
   viewer must show a visible non-production label, and the profile must never
   appear in a user delivery link.
3. Raw URL overrides for production quality are prohibited. Automated tests
   may select only a named non-production profile.
4. A production baseline change requires the user's explicit approval, a new
   decision record under `docs/spec-decisions/`, updated locked expectations,
   full regression tests, and visual acceptance. Passing tests alone do not
   authorize a baseline change.
5. Every delivery runs `python quality_contract.py`, plus `--task` for a
   generated character. Failure blocks delivery; it is not a warning.

## Required handoff evidence

- The active production profile and its effective resolution.
- Any non-production profile used during testing and why.
- Machine checks and separate visual review results.
- Git branch/commit and whether the formal D-drive worktree is clean.

This structure prevents temporary test accommodations from becoming invisible
production defaults. It does not replace artwork review; it makes specification
drift mechanically detectable before that review.
