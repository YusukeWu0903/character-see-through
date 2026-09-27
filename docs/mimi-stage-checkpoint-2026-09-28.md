# Mimi stage checkpoint — 2026-09-28

User verdict: current result is good; stop detail work here, checkpoint version control, update skills and publish the third portfolio card. This accepts the current stage, not future expressions or a fully articulated character.

## Delivered scope

- Cloud PSD-derived19 slots, repaired draw order, source-guided hair reconstruction, single face and ear/neck cleanup. Source PNG/PSD unchanged by motion work.
- Assembly v52 SHA256 D7D553734FEA9590F76492FC4C5ADAF6FBD6D0108E9B3339C55284859B445318. Face_far removed; pseudo-depth remains a reference rather than a compulsory runtime split.
- Current motion v62: existing idle and pointer controls, amplified coordinated body/hip follow, viewer-left/down versus viewer-right/up shoulder bank with small return compensation, waist-anchored horizontal skirt lag. Skirt only modifies bottomwear, no added vertical lift. Rollback v61.
- Native1280 textures, original filtering, maxDPR2 unchanged. CPU coordinate reuse isolates local fields; only transparent skirt mesh extent is excluded. One final GPU-to-Canvas copy remains.

## Evidence and remaining work

Task `_review/motion_v62/`: skirt_qa.json and native neutral/guide/left/right/return images. Neutral identical, guide restores, mirrored spring and live settling passed. Foreground RTX3060 v61/v62/v61 continuous follow54.40/52.44/49.64FPS. Initial37.16FPS trial retained; no lowered-resolution workaround.

Minor hair-edge issues deferred by user. No blink/replacement expressions, independent hair dynamics, hidden skin reconstruction or true3D promised. Existing local chest configuration retained; no new anatomical assets or motion added for this release. Public scope is an interactive stage showcase, not completion of every historical candidate claim.

## Reusable workflow decisions

Use original art for visible contours and shading; pseudo-depth suggests ownership but does not supply reliable hidden art. Avoid unnecessary near/far splitting of one continuous face: fractional alpha boundaries can open during resampling. A shadow-owned layer requires continuous concealed overlap and truthful receiver clipping before independent motion; extracting only a thin exposed strip creates a scar-like gap. Preserve unresolved ownership limitations rather than claiming full detachment.

Use per-frame geometry cache groups for the complete evaluator and matrix, separating local garment fields. Measure foreground idle and continuous scrubbing; GPU availability alone does not remove CPU vertex evaluation costs. Keep native texture quality, preserve failed performance trials and distinguish mechanical checks from user acceptance.

Public bundle: `site/mimi-demo/`, only resolved runtime assets/modules. No PSD, original references, inference artifacts or rejected versions. Existing Eris and Miffy published bundles are not rebuilt.
