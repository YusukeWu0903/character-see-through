---
name: eye-rig-asset-promotion
description: Create, validate, and promote task-scoped split-eye, gaze, and closed-eyelid assets for a character viewer. Use when changing eye gaze, blink assets, or their approval manifest.
---
# Eye rig asset promotion

Operate only on a named character task that has passed its base layer and alpha gates. Keep all artwork full-canvas and task-scoped.

## Contract

The runtime manifest must identify left/right eyewhite, irides, eyelashes, measured shared gaze limits, per-eye centres where needed, and only explicitly approved closed-eyelid artwork. Both eyes receive one shared gaze vector; clipping must use the matching eyewhite alpha.

## Validation

Check canvas size, alpha, registration, manifest schema, and that every runtime asset named by the manifest exists. Render neutral, cardinal, diagonal, and open/half/closed blink states. Verify no iris pixels remain outside its own eyewhite mask and that diagonal motion stays within the approved coverage threshold.

Automated checks do not replace visual review. Do not promote generated fallback or candidate art without recorded approval. Preserve the previous approved manifest/assets for rollback.