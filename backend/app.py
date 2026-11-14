#!/usr/bin/env python
"""Watch-the-Sky backend - real SPHEREx frame series for Sujal's site.

A small FastAPI service that feeds the "Watch the Sky" front-end REAL
SPHEREx level-2 image series instead of the simulated canvas sky:

    GET /health
    GET /api/star?name=Barnard's Star     (or WISE 0855, Epsilon Indi B,
                                           RW Aurigae, R Draconis, 3I/ATLAS)
    GET /api/patch?ra=269.45208&dec=4.69339&n=12
    GET /frames/<slug>/frame_01.png

Manifests come from the pre-generated static packs in static_data/
when present (instant, no IRSA traffic). Unknown patches are generated
on demand into cache/ with the same code path (first request is slow -
archive query + cutout downloads - later requests are served from
cache). See README.md and INTEGRATION.md.

Run:  uvicorn app:app --host 0.0.0.0 --port 8000
"""
import json
import os
import threading

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

import spherex

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(ROOT, "static_data")
CACHE_DIR = os.path.join(ROOT, "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

app = FastAPI(title="Watch the Sky - SPHEREx backend",
              description="Real SPHEREx level-2 frame series "
                          "(IRSA/IBE) for the Watch-the-Sky front-end.")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["GET"], allow_headers=["*"])

_locks = {}
_locks_guard = threading.Lock()


def _lock_for(slug):
    with _locks_guard:
        return _locks.setdefault(slug, threading.Lock())


def _find_pack(slug):
    """(dir, manifest_dict) from static packs or cache, else None."""
    for base in (STATIC_DIR, CACHE_DIR):
        mpath = os.path.join(base, slug, "manifest.json")
        if os.path.exists(mpath):
            with open(mpath) as f:
                return os.path.join(base, slug), json.load(f)
    return None


def _public_manifest(request, slug, manifest, target_name=None):
    m = dict(manifest)
    m["slug"] = slug
    if target_name:
        m["target"] = target_name
    base = str(request.base_url).rstrip("/")
    for fr in m["frames"]:
        fr["url"] = f"{base}/frames/{slug}/{fr['file']}"
    return m


def _generate(request, slug, ra, dec, n, restrict_dates=None,
              target_name=None):
    """Serve from pack/cache, or build on demand (locked per slug)."""
    found = _find_pack(slug)
    if found:
        return _public_manifest(request, slug, found[1], target_name)
    with _lock_for(slug):
        found = _find_pack(slug)  # another request may have built it
        if found:
            return _public_manifest(request, slug, found[1], target_name)
        out_dir = os.path.join(CACHE_DIR, slug)
        work_dir = os.path.join(CACHE_DIR, slug + "_fits")
        manifest = spherex.build_series(
            ra, dec, work_dir, out_dir, n=n,
            restrict_dates=restrict_dates, log=lambda *a: None)
        return _public_manifest(request, slug, manifest, target_name)


@app.get("/health")
def health():
    packs = []
    if os.path.isdir(STATIC_DIR):
        packs = sorted(d for d in os.listdir(STATIC_DIR)
                       if os.path.exists(os.path.join(
                           STATIC_DIR, d, "manifest.json")))
    return {"status": "ok", "service": "watch-the-sky-backend",
            "static_packs": packs,
            "targets": sorted(spherex.TARGETS)}


@app.get("/api/star")
def api_star(request: Request, name: str = Query(...),
             n: int = Query(spherex.DEFAULT_FRAMES)):
    slug = spherex.resolve_star(name)
    if slug is None:
        return JSONResponse(
            {"error": f"unknown star '{name}'",
             "known_targets": [t["name"] for t in
                               spherex.TARGETS.values()],
             "hint": "for arbitrary coordinates use /api/patch"},
            status_code=404)
    n = max(1, min(n, spherex.MAX_FRAMES))
    t = spherex.TARGETS[slug]
    try:
        return _generate(request, slug, t["ra"], t["dec"], n,
                         restrict_dates=t.get("restrict_dates"),
                         target_name=t["name"])
    except LookupError as e:
        return JSONResponse({"error": str(e)}, status_code=404)
    except Exception as e:  # IRSA/network/render failure
        return JSONResponse({"error": f"upstream failure: {e}"},
                            status_code=502)


@app.get("/api/patch")
def api_patch(request: Request, ra: float = Query(...),
              dec: float = Query(...),
              n: int = Query(spherex.DEFAULT_FRAMES)):
    if not (0.0 <= ra < 360.0) or not (-90.0 <= dec <= 90.0):
        return JSONResponse(
            {"error": "ra must be in [0, 360) and dec in [-90, 90]"},
            status_code=400)
    n = max(1, min(n, spherex.MAX_FRAMES))
    slug = spherex.slug_for_patch(ra, dec)
    try:
        return _generate(request, slug, ra, dec, n,
                         target_name=f"Custom patch {ra:.4f}, {dec:+.4f}")
    except LookupError as e:
        return JSONResponse({"error": str(e)}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": f"upstream failure: {e}"},
                            status_code=502)


@app.get("/frames/{slug}/{file}")
def frames(slug: str, file: str):
    if "/" in file or ".." in file or ".." in slug:
        return JSONResponse({"error": "bad path"}, status_code=400)
    for base in (STATIC_DIR, CACHE_DIR):
        path = os.path.join(base, slug, file)
        if os.path.isfile(path):
            return FileResponse(path, media_type="image/png")
    return JSONResponse({"error": "frame not found"}, status_code=404)


@app.get("/")
def index():
    return {"service": "watch-the-sky-backend",
            "endpoints": ["/health", "/api/star?name=",
                          "/api/patch?ra=&dec=", "/frames/<slug>/<file>"],
            "docs": "see README.md / INTEGRATION.md"}
