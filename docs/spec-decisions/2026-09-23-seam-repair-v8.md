# Approved Eris seam-repair artwork — 2026-09-23

## User decision

The user reviewed the moving `seams_skin_straps_v8` candidate and explicitly
approved it as final: "我覺得你已經做的很棒了，就以這個為定版吧!!!"
This approval replaces the Eris torso seam artwork only. The head seam is
byte-identical to the prior approved asset. It does not approve a change to
inference resolution, viewer quality, animation defaults, or other characters.

## Production lock

- Task: `Eris_full_body_casual_20260918_113905`.
- Candidate: `_rig_candidates/seams_skin_straps_v8`.
- Active approved directory: `_rig_assets/seams_skin_straps_v8_20260923T054759025970Z`.
- Approved torso SHA-256: `84faf4cd5715e027735fe91a2df258a45f1da56f00cf35e4cdadc000b9316cee`.
- Approved head SHA-256: `601335ec2e1d0841e76fe407b12bd39fc5a830b3ea48cb31e3dd474631590548`.
- The accepted artwork keeps neck/shoulder skin repair and shoulder straps but
  removes the black bust fragments from the repair overlay. The normal topwear
  layer remains unchanged.

The prior approved directory `_rig_assets/seams_v2_20260920T073128489648Z`
and rollback manifest `_rig_assets/seam_assets.before_20260923T054759025970Z.json`
remain available. The production viewer must load the new manifest without a
candidate query parameter. The user's visual approval above is the authority
for this artwork change; passing machine tests alone is insufficient.

## Unchanged production specifications

All non-artwork values and the `browser-validation` exception from
`2026-09-20-production-baseline.md` remain in effect. Public-site deployment and
independent arm/chest mesh isolation are outside this approval.
