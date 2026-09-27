---
name: psd-depth-recovery
description: Estimate missing See-through pseudo-depth from an existing source PSD without regenerating its artwork.
---

# PSD depth recovery

Read see-through-local and the production baseline. Inspect installed
apply_marigold: it consumes registered source and semantic RGBA PNGs, not a PSD
directly. Never implicitly call apply_layerdiff or further_extr.

Use the selected original PSD and illustration, not rejected derived assets.
Extract full-canvas parts with offsets into an isolated repository candidate,
preserving alpha. Record input hashes and aspect-fit registration. Reject unknown
names, duplicates, groups or incompatible canvases. Exclude ground shadows.

Use tools/recover_psd_depth.py --prepare-only, inspect staging, then --infer.
Use cached anime Marigold weights and baseline depth resolution. Do not modify
upstream, kill other GPU workloads, lower quality or replace models implicitly.
Preserve failures. Validate dimensions, nonconstant depth within alpha, input
hashes, and alignment in previews.

Combined hair depth is shared by front/back source layers in this upstream route;
it cannot certify their ownership. New inference is not the exact cloud result.
Depth is relative order, not physical 3D or painted shadows. Median sorting cannot
solve all occlusions. Keep experimental; never auto-promote artwork or re-splits.

Run quality_contract.py on the original task and quick_validate.py on this skill.
Record material results through daily-work-log before handoff.
