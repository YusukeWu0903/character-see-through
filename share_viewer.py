"""Narrow public-share server for one reviewed character task.

This is deliberately separate from ``main.py``.  It exposes only the browser
code and image/JSON files required to render the named task; no upload,
inference, arbitrary-output, PSD, or filesystem endpoints exist here.
"""
from pathlib import Path
import mimetypes
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

BASE = Path(__file__).resolve().parent
TASK = "Eris_full_body_casual_20260918_113905"
TASK_DIR = (BASE / "outputs" / "seethrough_local" / TASK).resolve()
CLOUD_DIR = (BASE / "outputs" / "seethrough").resolve()
VIEWER_DIR = (BASE / "viewer").resolve()
VIEWER_FILES = {"deform-preview.mjs", "mesh-renderer.mjs", "rig.mjs", "motion.mjs", "deformation.mjs", "expression.mjs", "eris-deform.json"}
CLOUD_FILES = {"backhair.png", "handwear.png", "legwear.png", "topwear.png", "neck.png", "bottomwear.png", "earwear.png", "ears.png", "face.png", "mouth.png", "eyelash.png", "nose.png", "eyebrow.png", "irides.png", "fronthair.png"}

app = FastAPI(title="Character Preview Share", docs_url=None, redoc_url=None, openapi_url=None)
# Windows may otherwise classify ES modules as text/plain, which browsers
# refuse to execute when loaded through a public tunnel.
mimetypes.add_type("text/javascript", ".mjs")


def resolved_child(root: Path, name: str) -> Path:
    path = (root / name).resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(404)
    return path


@app.get("/")
async def root():
    return RedirectResponse(f"/preview-secondary?local={TASK}")


@app.get("/health")
async def health():
    return {"status": "ok", "task": TASK, "scope": "single-reviewed-character"}


@app.get("/preview-secondary", response_class=HTMLResponse)
async def preview(local: str):
    if local != TASK:
        raise HTTPException(404)
    return (VIEWER_DIR / "deform.html").read_text(encoding="utf-8")


@app.get("/viewer-assets/{name}")
async def viewer_assets(name: str):
    if name not in VIEWER_FILES:
        raise HTTPException(404)
    return FileResponse(resolved_child(VIEWER_DIR, name))


@app.get("/layers/seethrough/{name}")
async def cloud_layer(name: str):
    if name not in CLOUD_FILES:
        raise HTTPException(404)
    return FileResponse(resolved_child(CLOUD_DIR, name))


@app.get("/layers/seethrough_local/{task}/{name:path}")
async def local_layer(task: str, name: str):
    if task != TASK or Path(name).suffix.lower() not in {".png", ".json"}:
        raise HTTPException(404)
    return FileResponse(resolved_child(TASK_DIR, name))
