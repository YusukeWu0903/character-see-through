---
name: daily-work-log
description: Maintain the shared dated AI project work log whenever a project has a material output, optimization, verification result, decision, rollback, or approved milestone. Use across projects; do not use for routine chat with no work change.
---

# Shared daily work log

Use this skill before handing off material project work. Its purpose is a
durable handover record that another agent can understand without reconstructing
the conversation or Git history.

## Destination and ownership

- Destination: `D:\Project\AI_Daily_Work_Log`.
- Filename: `YYYY-MM-DD_OpenAI-Codex.md`, using the host's local date.
- There is **one file per day**, shared by every project. Read an existing file
  first and append a new project section; never replace its content.
- If the folder or current-day file does not exist, create it. Do not create a
  file for a day with no material work.
- This shared path is outside an individual repository. Request the required
  filesystem approval rather than working around it.

## When to write

Write or update an entry when the task produces a meaningful artifact or
decision: a feature, bug fix, inference run, validated PNG/PSD, test result,
viewer/share change, research conclusion, acceptance, rollback, or known
quality failure. Do not log trivial status checks or unchanged monitoring.

## Entry contract

Append a timestamped `## <project name>` section. Include only facts that can
be supported by the current work:

1. **Outcome and scope** — what changed, or what was deliberately rejected.
2. **Artifacts** — relevant repository paths, isolated task folders, output
   names, public links only when intended, and changed source files.
3. **Verification** — commands/checks actually run, visual review, and their
   results. Keep numerical and visual acceptance distinct.
4. **Decisions and limits** — trade-offs, user feedback, blocked work, known
   defects, and what must not be claimed as complete.
5. **Version control** — branch, commit/checkpoint, and whether the worktree
   is clean. Do not include credentials, tunnels' secrets, access tokens,
   private keys, or unrelated personal data.

Use plain Markdown. When the same project has multiple material changes in a
day, add a later timestamped subsection or amend that project's section while
preserving its earlier facts. Keep different projects separate.

## Cross-project and scheduled use

For an end-of-day sweep, inspect each accessible project with material changes
since its last entry. Append all qualifying projects to the same current-day
file. A scheduled sweep must stay silent and leave no empty file when no
project changed. It must not infer acceptance from passing automated tests.

## Handover

Mention the updated log path in the final handoff. If a detailed project audit
is stored in the repository, link it from the daily entry rather than omitting
the important limitations.
