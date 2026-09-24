---
name: character-motion-rig
description: Build and validate a task-scoped animated character rig after layer assembly, including body/arm/hair motion, chest follow-through, blink, gaze, mouth shapes, and expressions; not for raw see-through inference or public release.
---

# Character motion and expression rig

Start from a named character task and an explicitly reviewed assembly candidate. Static appearance approval is not motion approval. Keep all candidates and derived assets under that task, preserve the source PNGs/PSD and prior manifests, and calibrate this character's pivots, registration, and permitted range instead of copying Eris values. Read `viewer/quality-baseline.json` and `docs/spec-change-policy.md` before touching runtime defaults or approved assets.

Choose the relevant route before implementation:

- For hierarchy, body, arms, legs, hair, and chest response, read [body motion](references/body-motion.md).
- For face reconstruction, blink, gaze, mouth and expression switching, read [facial motion](references/facial-motion.md), `skills/eye-rig-asset-promotion/SKILL.md` when eye assets are changed or promoted, and `skills/character-expression-transplant/SKILL.md` before transplanting mouth or expression artwork.
- For any new or revised part movement, read [visual influence review](references/deformation-field-review.md) before calibrating the affected area or amplitude. Show the actual influence or joint/mask geometry in a default-off review guide; a guide for one part does not certify the others.

Keep the semantic part tree, back-to-front draw order, and motion parents separate. A source layer containing both arms or both legs is not proof they can move independently. A replacement head with painted-in eyes and mouth is an appearance reference, not an eye/expression rig. Refuse to activate controls that would double a baked feature or expose unsupported hidden anatomy.

At each stage, require a versioned manifest with exact task/source hashes, asset paths, calibrated pivots, affected parents, tested parameter range, rollback manifest, and pending/accepted review state. Compare the neutral rig frame pixel-for-pixel with its approved assembly baseline; review native-size and close-up animation at motion extrema and intermediate frames. Record gaps, double contours, clipping, cloth/skin separation, and return-to-neutral behavior separately from automated tests. Do not promote the candidate or alter the production default before the user approves its actual motion. Run `python quality_contract.py --task <task-directory>` before handoff and update the shared daily log for material outputs or decisions.
