# Project status — 2026-09-26

The user accepted Miffy v50's motion/performance and requested uploading all
relevant updates to GitHub and the existing portfolio showcase. This is a stage
checkpoint, not a claim of completed expressions, audio lip-sync or full 3D.

- Shared WebGL backend: native 1280 layers, connected triangles, static textures
  and revision-cached eye/mouth source. Existing stance/hip/arms/chest/hair/neck,
  curved yaw/pitch and signed lighting use the common GPU scene.
- Fixed flashing strip seams and blink ear-root ownership. Retained six source
  mouth shapes (closed, slight, A/E/O/U), manual switching and silent talk demo.
- Same-host D3D11 short sample v48→v50: idle 49.8→52.0 FPS; continuous ±50 head
  scrub 20.1→43.1 FPS. Not a guarantee for other devices or software rendering.
- v49 direct GPU presentation was slower; v50 intentionally keeps one final
  Canvas copy. Native textures, ranges, signs and control semantics unchanged.
- Mechanical QA: exact neutral/reset, strict mouth ownership, all six talk
  states, nine head/blink/gaze combinations, guides restoring, no opaque-source
  stance alpha gaps, fixed sole alpha, 18 lighting states matching CPU equations,
  renderer-alpha tests and production quality contract passed.
- Existing motion SKILL now requires a shared-renderer inventory, real displayed
  buffer checks, idle and scrub measurements, preserved regressions and explicit
  remaining routes. See [renderer details](shared-character-renderer.md).

Public target: [Miffy portfolio demo](https://my-portfolio-omega-beryl-98.vercel.app/miffy-demo/).
Release browser/build evidence must be recorded before claiming deployment complete.

Publication verified at 15:56 Asia/Taipei: portfolio `main` commit `19d67cc`
deployed through its existing Vercel Git integration. Next.js production build
passed; the actual deployed default URL rendered v50, passed hash checks and
all runtime requests, six mouth shapes, body/arms, gaze/blink, yaw/pitch and
reset controls. The 390px mobile check retained a 520px scrollable canvas.
Pipeline code/docs/SKILL were pushed to `codex/eye-gaze-rig` (implementation
`fcbae99`, manifest-byte integrity fix `bcffa4a`), not force-merged into its
divergent `main`. Unrelated local Eris/site drafts remain uncommitted.

The first cloud check rejected newline-normalized JSON bytes. Scoped Git
attributes now preserve hashed runtime assets; staged bytes were checked in
both repositories and the actual cloud browser gate passed after redeployment.
Historical v40 status remains in the dated 2026-09-25 report. No source artwork,
PSD, rejected asset or test profile belongs in the public runtime bundle.
