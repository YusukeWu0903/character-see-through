---
name: portfolio-interactive-showcase
description: Package an approved interactive character viewer as a public static portfolio page for Vercel, GitHub Pages, or equivalent hosting. Use when a project card must open a live character demo.
---
# Portfolio interactive showcase

Create a self-contained public bundle from one explicitly approved character task. Preserve browser-side motion, gaze, blink, and approved repairs; do not weaken production quality for hosting.

## Before packaging

- Confirm the character and artwork may be publicly displayed.
- Read the task quality baseline and policy. Run its production preflight before delivery.
- Define the exact public URL, host path, and the default task. A root demo URL must work without a query parameter.

## Public bundle contract

Include only runtime HTML, JavaScript, configuration JSON, main RGBA layers, and every approved runtime dependency, including split eyes, approved eyelids, and seam assets. Exclude PSDs, original inputs, model/inference code, credentials, ignored test output, and rejected candidates.

Convert local-server routes to the final host path. Do not assume a trailing slash. Inventory every module, JSON, and image request before publishing; 200 for the HTML alone is not acceptance.

For byte-hashed runtime manifests/assets, preserve their exact bytes through Git
and deployment, not only during local copying. Scope `.gitattributes -text` to
the hash-addressed runtime tree when newline normalization would invalidate
existing hashes. Check staged/committed blobs against packaged files before
publishing; never disable integrity checks to make the cloud page load.

## Release gate

Run the host build. Open the deployed page in a real browser, not only an HTTP client. Verify the default task renders, controls work, and all runtime assets return success. If any asset is missing or the canvas is blank, stop delivery and repair the bundle before sharing the URL.

Record the public scope, host, verification, known limits, branch, and commit in the shared work log.
