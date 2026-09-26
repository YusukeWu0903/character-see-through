---
name: interactive-showcase-release-check
description: Perform the final release gate for a publicly hosted interactive character showcase. Use before sharing or updating a Vercel, GitHub Pages, or other public demo URL.
---
# Interactive showcase release check

This is a delivery gate, not a builder. Do not claim a public showcase is ready from a successful deployment or HTTP 200 alone.

## Required evidence

- Production quality contract and character-task preflight pass.
- The deployed entry URL loads its default task without manual query parameters.
- Every module, JSON file, main layer, split-eye asset, approved eyelid, and approved seam asset requested at runtime is available.
- Hash-checked manifest/asset bytes survive the Git/deployment path, and the browser actually passes those checks; successful HTTP responses alone do not prove integrity.
- A real browser renders visible characters and accepts the core controls: gaze, blink, motion, and reset.
- The public bundle excludes PSDs, inputs, inference tools, credentials, and rejected assets.

If any check fails, report the exact missing route or runtime error and stop release. After passing, record URL, host, visual evidence, automated results, branch, commit, and remaining limitations in the shared work log.
