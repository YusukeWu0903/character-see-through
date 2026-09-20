# Production baseline decision — 2026-09-20

## Accepted production contract

- LayerDiff layer resolution: 1280 px.
- Inference steps: 30.
- Depth resolution: 768 px.
- Interactive viewer texture uploads: native artwork resolution, capped at
  1280 px for the current pipeline.
- Browser device-pixel ratio cap: 2.
- User-approved shoulder/neck seam assets remain enabled by default.
- Viewer control defaults are body/torso/head/yaw/gaze/blink 0, breath 30,
  hair 10, energy 55, and bust 28; idle, body follow, gaze follow, and automatic
  blink are enabled.
- The accepted Eris state is locked to the expanded 2 px horizontal / 1.5 px
  vertical gaze range and the exact user-approved closed-eyelid and
  shoulder/neck seam asset hashes.

These values preserve the accepted source and viewer quality. The source PNGs
and PSD are never destructively resized for preview stability.

## Isolated validation exception

Headless Chromium/SwiftShader validation may use the named
`browser-validation` profile at 768 px to bound memory while another viewer is
open. It is explicitly non-production, visibly labelled, and may not be used
in a user delivery URL. The production profile remains the default when no
quality profile is present.

## Change authority

Changing this production contract requires a new, explicit user approval and a
new decision record. Performance or test stability alone is not authorization.
