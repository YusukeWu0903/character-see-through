# Run and acceptance: new character layer decomposition

This is the first-stage checklist. It intentionally does not cover eye rigs, seam promotion, expressions, motion mesh work, or deployment. A model can produce 17 files while failing visually; keep numeric and visual verdicts separate.

## 1. Intake and worktree identity

- Confirm the user-selected source image, character name/task purpose, full-body versus bust/portrait framing, and whether crop, occlusion, accessories, bare feet, or merged hair/clothing are intentional. Do not infer hidden art from an unrelated prior character. If the image is too small or ambiguous, describe the risk before spending a long inference run.
- Use the resolved current repository root, not a similarly named checkout. Check `git status --short` and preserve unrelated changes. Source images may stay where supplied; `inputs/` is preferred for reusable originals, but never move an existing user file merely to satisfy this convention.
- `SEE_THROUGH_HOME` must point to the external upstream checkout. The wrapper requires its `.venv`, inference script, and local `models_hf` cache. It sets Hugging Face offline mode; missing weights are a setup failure, not a reason to lower production settings. `PSD_PYTHON` is optional when the current Python can run `dev_psd_write.py`.
- Run the read-only preflight before inference. Status/exit codes: `machine_pass`/0, `blocked`/1, `review`/2. A review warning needs judgment, not an automatic retry. The script does not prove GPU health, VRAM capacity, or artistic suitability. Check GPU/driver separately if the inference process reports a hardware error.

```powershell
python skills/see-through-local/scripts/check.py preflight "<input-image>"
python quality_contract.py
```

## 2. Production run and evidence

```powershell
python run_seethrough_local.py "<input-image>"
```

The wrapper reads current production defaults from `viewer/quality-baseline.json` (currently 1280 layer resolution, 30 steps, 768 depth resolution), stages a uniquely named input in `outputs/seethrough_local/_staging/`, runs the external model, copies canonical layers to a unique task directory, removes only confirmed neutral edge-connected alpha plate, writes `_alpha_validation.json` and checkerboard/per-layer previews, then exports `<input>_clean.psd` from those cleaned PNGs. It does **not** use upstream direct PSD export.

A 12 GB GPU with group offload can take well over an hour. Progress is not measured by when face layers first appear. If interrupted or failed, inspect the process exit, logs, staged name, and upstream workspace. Do not write a second run into an existing task, delete evidence, patch upstream, or reduce production resolution as an expedient. A rerun creates a new task and preserves the failed one for diagnosis.

Expected task contents include `_order.json`, canonical full-canvas RGBA PNGs (normally 17), `_alpha_validation.json`, `_alpha_checkerboard.png`, `_previews/`, and one `_clean.psd`. A missing or empty semantic part requires review even if the wrapper printed completion. The upstream may omit a layer; the wrapper currently skips absent files instead of inventing replacements.

## 3. Automated audit: a gate, not an approval

```powershell
python skills/see-through-local/scripts/check.py audit "outputs/seethrough_local/<task>"
python quality_contract.py --task "outputs/seethrough_local/<task>"
```

The audit checks task isolation, order uniqueness, expected semantic layer presence, PNG readability/RGBA/native canvas, nonempty alpha, the alpha report, checkerboard, clean PSD signature, and the locked quality contract. `blocked`/1 prevents handoff; `review`/2 requires a human decision; `machine_pass`/0 means only that the mechanical gate passed. Read `_alpha_validation.json` itself. Its `deliverable` field is an alpha/coverage assessment, not a substitute for visual review. If a layer is intentionally absent (e.g. no earrings) or nearly empty (e.g. bare feet), record the semantic reason instead of creating false pixels or silently rewriting the report.

`clean_layer_rgba` removes only a neutral candidate connected to the canvas edge. It deliberately preserves isolated grey clothing/shadows and hidden-region inpainting. Never clear all grey pixels or all pixels unlike the source: LayerDiff can paint valid unseen areas differently from the input, and broad erasure creates skin/hair seams.

## 4. Visual acceptance matrix

Open `http://127.0.0.1:8010/preview?local=<task>` with `python main.py` running. Inspect at normal size and zoom; view each PNG against checkerboard and over the reconstructed character. Compare cloud/reference image when available, but a missing cloud reference is not a licence to skip input-to-reconstruction comparison.

| Region | Inspect | Common failure to record |
| --- | --- | --- |
| Silhouette and background | Full-body outline; all four canvas edges; transparency around fine strands | Grey/white plate, halos, accidental cutouts |
| Hair and face | Front/back hair overlap; eyes, brows, nose, mouth; face contour | Hair contamination, missing iris/eyelash, doubled mouth, inpaint seam |
| Neck and shoulders | Head-to-torso join and left/right shoulder under normal pose | Visible seam, duplicate skin, repair covering clothing |
| Clothing and arms | Sleeve/strap edges, upper arms, wrists/hands, garment occlusion | Torso or garment pixels attached to the wrong moving limb |
| Lower body | Waist, shorts/skirt, thighs, knees, ankles, shoes/bare feet | Leg cut-off, empty footwear misread as missing feet, gap or doubled edge |
| Isolated parts | Each layer's extent, alpha and order versus `_order.json` | Missing semantic part, opaque rectangular plate, unexpected hidden paint |
| PSD | Reopen the exported PSD and compare composite to cleaned PNG preview | Wrong layer order, lost alpha, canvas mismatch |

Visual review is character-specific. A seam-repair or eye-asset success on Eris does not certify a new character. If the viewer only shows a rigid base, do not infer that future rig deformation is already safe.

## 5. Defect triage and stopping rules

- **Setup/model missing or wrong worktree:** stop before inference; correct the environment and rerun preflight. Do not alter the external upstream checkout without explicit permission.
- **Only edge-connected neutral plate:** inspect the alpha report and checkerboard. If the existing cleanup missed a confirmed border-connected plate, repair the cleanup algorithm with tests and generate a new reviewed output; do not use global colour erasure.
- **Missing/empty semantic layer:** compare the input and upstream output. An intentionally absent accessory can be documented as an exception; a missing arm, face, leg, or shoe on a shod character is a blocking visual defect. Request user direction if correct anatomy cannot be recovered from the source.
- **Localized join, occlusion, or inpaint artifact:** preserve the original task and make a separate candidate repair with before/after evidence. Hand off to the appropriate seam/eye/rig workflow after base-layer acceptance; never silently overwrite the approved layer.
- **Widespread bad decomposition or unsuitable source:** prefer a newly staged run or improved input after explaining the evidence. Do not repeatedly spend inference time with unchanged settings and no diagnosis.
- **PSD differs from PNG composite:** do not deliver it. Check order/alpha and the local `dev_psd_write.py` route; upstream direct PSD is not a fallback.
- **Machine check passes but appearance fails:** status remains rejected or pending repair. Conversely, a documented intentional empty accessory can be accepted by a human without falsifying machine evidence.

## 6. Handoff record

Record the source image, exact task directory, baseline values, 17-layer completeness or exceptions, audit/quality results, alpha findings, visual review by region, PSD comparison, accepted reviewer decision, and open defects. Keep failed and accepted claims distinct. Material output goes in the shared dated work log. Do not publish a temporary or persistent link unless the user requests sharing; then read `references/sharing.md` and the showcase release skills.
