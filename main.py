"""Local static server for the see-through result viewer.

Inference is intentionally run by ``run_seethrough_local.py``.  This server
only exposes the generated layers and the comparison viewer; it has no ComfyUI
or upload-pipeline dependency.
"""
from pathlib import Path
import mimetypes

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
OUTPUTS_DIR = BASE_DIR / "outputs"

# Windows registry MIME mappings may classify .mjs as text/plain.
mimetypes.add_type("text/javascript", ".mjs")
app = FastAPI(title="Auto-Layering Pipeline Viewer", version="1.0")
app.mount("/layers", StaticFiles(directory=str(OUTPUTS_DIR)), name="layers")
app.mount("/viewer-assets", StaticFiles(directory=str(BASE_DIR / "viewer")), name="viewer-assets")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "see-through-viewer"}


@app.get("/preview", response_class=HTMLResponse)
async def preview() -> str:
    return (BASE_DIR / "preview_viewer.html").read_text(encoding="utf-8")


@app.get("/preview-rig", response_class=HTMLResponse)
async def preview_rig() -> str:
    return (BASE_DIR / "preview_rig.html").read_text(encoding="utf-8")


@app.get("/preview-deform", response_class=HTMLResponse)
async def preview_deform() -> str:
    return (BASE_DIR / "viewer" / "deform.html").read_text(encoding="utf-8")


@app.get("/preview-expression", response_class=HTMLResponse)
async def preview_expression() -> str:
    return (BASE_DIR / "viewer" / "deform.html").read_text(encoding="utf-8")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8010)
