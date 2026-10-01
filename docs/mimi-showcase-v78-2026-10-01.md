# Mimi v78 showcase checkpoint — 2026-10-01

The user requested a Mimi-only Git and portfolio update. The prior public stage
was v62 (`94eec96` in this repository and `9bec12f` in the portfolio). This
checkpoint packages the local v78 review candidate as an interactive stage
showcase. It does not claim that every visual detail is final.

## Scope

- Mimi-only public runtime: `site/mimi-demo/`, including `motion_v78` rig,
  `assembly_v60`, eyes v67, and the source-registered kiss expression v6.
- The card text and badge in the separate portfolio repository describe v78,
  blink, closed-eye kiss, hair tips, and chest/skirt/shoulder motion.
- The gaze control remains disabled. Original PSD/reference inputs and other
  characters' candidate assets are not included in this release bundle.
- Four superseded v62 runtime files were removed from the v78 bundle. Git
  history retains the complete v62 rollback.

## Verification

- `python quality_contract.py --task outputs/seethrough_local/Mimi_cloud_20260927`: pass.
- 45 packaged asset hashes and 26 module paths: pass in both repository copies.
- `node tests/test_miffy_motion.mjs` (11/11) and
  `node tests/test_miffy_neck_hair.mjs`: pass as shared-viewer regressions.
- Portfolio `npm run build`: pass.
- Local production-server browser: Mimi v78 loaded all 19 layers, neutral and
  closed-eye kiss rendered, screen-left/intermediate/screen-right body controls
  responded, slashless and trailing-slash routes loaded, updated home card was
  visible, and the existing Miffy v50 route still loaded 17 layers.

## Review status

Mimi v78 is a stage showcase based on the user's publication request. The
specific lower chest influence change and earlier hair/face expression details
remain open to further visual feedback; their task-local QA and v77 rollback
remain under `outputs/seethrough_local/Mimi_cloud_20260927/_review/`.
