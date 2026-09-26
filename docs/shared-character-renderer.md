# Shared character renderer migration

User selected the shared-GPU architecture route, preserving Miffy v45 as rollback.
Working review candidate: task `_review/motion_v48/rig.json`.
This is stage one, pending user visual acceptance; not a production release.

Eris and the new Miffy field adapter share `viewer/mesh-renderer.mjs` WebGL
context/program/texture primitives, native textures, premultiplied blending,
connected indexed triangles and resource handling. Eris's existing shader,
control meanings and movement gains are unchanged. Miffy's existing character
evaluators and spring/state-machine settings remain task-specific; Eris's
numerical amplitudes are not copied.

Miffy stance/hip, arms, hair, neck, pitch-follow and bust now compose into one
GPU scene. The reviewed head surface/lighting and eye/mouth sprite composition
remain the existing native-pixel route feeding a revision-cached head texture.
The final viewer still presents that scene on its existing Canvas2D surface.
Thus this is not a completed end-to-end GPU head pipeline or unified viewer.
Guides travel through the same scene mesh and part ordering, default off.
Neutral bypasses deformation so original pixels remain identical to v45.

Preserved unsuccessful internal trials: v46 warped individual fields but copied
each one back to CPU (about 4 FPS in forced software WebGL); v47 batched the
scene but used excessive grids/synchronization (about 5 FPS there). v48 uses
Eris's 24-column/80-row baseline geometry plus local boundary/detail samples,
static texture reuse and per-head revisions without per-layer error-query stalls.
Forced SwiftShader v48 measured about 7.5 versus v45's 13 FPS; do not hide that
software-renderer regression. The testing endpoint 9337 explicitly forces
SwiftShader. Endpoint 9348 was launched in an isolated D3D11 headless profile.

Three hardware-path idle samples: 36.2→44.8, 38.7→51.9, 41.5→56.6 FPS.
These are short same-host diagnostic samples, not a universal or in-app FPS
guarantee. Continuous head scrubbing has not yet been separately benchmarked.
Performance acceptance remains pending actual viewer review, especially mobile
or software-only environments.

Mechanical evidence: native 1280 textures, exact neutral equality, six source
mouths, automatic talk/pause/reset, blink/gaze with yaw-pitch extrema, zero
interior partial-alpha seams for six ±stance poses, guide-on effect and guide-off
restoration, fixed sole-row alpha within one quantization level, renderer-alpha
tests (3/3) and production quality contract pass. Artistic acceptance is distinct.

Next stages: user review of continuous body/hip/arm/hair playback and seams;
measured head-scrub profiling; head/lighting GPU migration only after preserving
its agreed geometry/lighting examples; unify task-driven viewer/control assembly
and release packaging. No assets deleted, public defaults changed or deployment.

## v48 acceptance and v50 completion candidate — 2026-09-26

The user confirmed that v48's flashing black lines are gone. This accepts that
defect repair, not every new renderer or public delivery.

v50 (`_review/motion_v50/rig.json`, rollback v48) moves the reviewed curved head
onto the same connected-triangle backend and its signed yaw/pitch light onto
the fragment shader. Eye/mouth sprites are composed only when their revision
changes, then uploaded at native 1280 resolution. Existing evaluators, light
equations, motion ranges, spring settings and control semantics are retained.
Dense head geometry covers actual source alpha support plus a two-pixel
transparent filtering margin; it does not resize or downsample the texture.
All actual deformation/light fields now use the shared GPU scene.

v49 preserves the fully direct-GPU presentation trial. On the measured D3D11
backend it regressed idle from roughly 47–51 to 34–37 FPS even after removing
retained-buffer/layout overhead. It is not the recommended candidate. v50
keeps one final Canvas copy for the existing presenter; no per-part readbacks
or CPU per-pixel head warp/lighting remain during animated GPU playback.
Neutral/reference remain exact native static bypasses. A copy-free presenter
is therefore an unresolved optimization, not an implemented production default.

After alpha-support geometry optimization, a same-host short sample measured
v48→v50 idle 49.8→52.0 FPS and continuous ±50 yaw/pitch scrub 20.1→43.1 FPS.
These are diagnostic samples, not device-independent guarantees. Software-GPU,
mobile perceptual performance and actual user motion acceptance remain pending.

Evidence: browser QA reads the real displayed buffer; neutral equality,
six mouth ownership boundaries, talk/pause/reset, blink/gaze at nine combined
poses, guides restoring exactly, six opaque-source stance poses with no seams
and fixed sole alpha pass. Eighteen signed/zero/disabled light states at four
sample points match the original CPU equations within zero channel levels on
this backend. Renderer alpha tests pass 3/3; quality contract passes. Tests and
screenshots live under each candidate; the failed diagnostics are preserved.
No public assets/defaults were promoted, deployed or deleted.

## Accepted publication checkpoint

After reviewing v50 the user confirmed its perceptual performance improvement
and requested GitHub/portfolio publication on 2026-09-26. The public package
now targets v50 at the existing `/miffy-demo/` route, with a separate release
approval record and only required runtime dependencies. Source candidate flags
and hashes remain unchanged. Prior pending-review statements above describe
the earlier implementation checkpoint, not the subsequent user decision.
