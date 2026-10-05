# Mimi v95 showcase checkpoint — 2026-10-05

User-requested Mimi-only Git and portfolio update. This is an explicit stage
checkpoint, not final visual approval of the newly edited hair or expression.

## Public scope

- Isolated bundle: `site/mimi-demo/` and portfolio `public/mimi-demo/` only.
- Candidate: `motion_v95` based on the immutable user hair-fix snapshot in
  `motion_v94` / `assembly_v65`.
- Expression: neutral → kiss closes the eyes before face/mouth/blush blending;
  return to neutral reverses the order. The active-sequence redraw correction
  is included in the bundled runtime.
- No PSD/source images, inference artifacts, rejected candidates or other
  characters' bundles are part of this update.

## Verification and limits

- Quality contract passed for `Mimi_cloud_20260927`.
- Package inventory: 58 hash-pinned runtime assets (including the inherited
  motion rig chain) and 30 recursively resolved modules; hashes match in the
  pipeline and portfolio copies. `.gitattributes` preserves JSON bytes.
- Portfolio production build passed. Local browser default `/mimi-demo/` loaded
  19 layers without query parameters; kiss selection, eye transition and disabled
  gaze were checked. Detailed timing, face/hair-edge quality and user acceptance
  remain pending. This checkpoint must not be described as final approval.
- Rollback: prior v78 bundle and prior portfolio commit remain in Git history.

## Delivery record

Fill in the final pipeline/portfolio commit IDs and live URL after pushes and
production-browser verification.
