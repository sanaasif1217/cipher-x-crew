#!/usr/bin/env python
"""Watch-the-Sky backend - shared SPHEREx data core.

Everything here is REAL data plumbing, reused from the Cipher-X Crew's
verified Cipher-X Omega pipeline (steps 01 and 13):

* Epoch finding  = pipeline step 13: query the IRSA TAP service
  (spherex.obscore) for every level-2 image whose footprint contains a
  given RA/Dec.
* Frame download = pipeline step 01: resolve each epoch's DataLink URL to
  its level-2 FITS file, then request an IBE cutout
  (<fits_url>?center=<ra>,<dec>d&size=0.5) so every frame is the same
  0.5-degree patch.
* Alignment/rendering follows step 01: reproject every cutout onto the
  first frame's WCS grid, subtract each frame's median background, and
  render PNGs with an asinh stretch. One difference, on purpose: the
  stretch is normalised by a GLOBAL scale/max computed across the whole
  series instead of per frame, so a variable star (RW Aurigae,
  R Draconis) really does brighten and fade between frames instead of
  being re-normalised away.

Data source: NASA/IPAC Infrared Science Archive (IRSA), SPHEREx
level-2 images (collections spherex_qr2 / spherex_dr1 / spherex_qr3).
"""
import json
import os
import re
import time

import numpy as np
import requests

TAP_URL = "https://irsa.ipac.caltech.edu/TAP"
FIELD_SIZE_DEG = 0.5
DISPLAY_PX = 900
MAX_FRAMES = 16
DEFAULT_FRAMES = 12

# The five benchmark stars from the challenge brief (coordinates verified
# against the SPHEREx archive with pipeline step 13 on 2026-11-13/14),
# plus the team's worked example, the 3I/ATLAS comet field.
TARGETS = {
    "barnards-star": {
        "name": "Barnard's Star", "ra": 269.45208, "dec": 4.69339,
        "note": "High proper-motion star; verified 183 SPHEREx level-2 "
                "epochs, 2025-08-15 to 2026-09-22.",
    },
    "epsilon-indi": {
        "name": "Epsilon Indi B", "ra": 330.84024, "dec": -56.78598,
        "note": "Brown-dwarf pair ~7 arcmin from the Epsilon Indi A "
                "centre used here, inside the same 0.5-degree field; "
                "verified 238 epochs, 2025-04-24 to 2026-10-02.",
    },
    "wise-0855": {
        "name": "WISE 0855", "ra": 133.79513, "dec": -7.24515,
        "note": "Fast-moving brown dwarf; verified 129 epochs, "
                "2025-05-05 to 2026-05-14.",
    },
    "rw-aurigae": {
        "name": "RW Aurigae", "ra": 76.95653, "dec": 30.40144,
        "note": "T Tauri variable star; verified 168 epochs, "
                "2025-09-01 to 2026-09-16.",
    },
    "r-draconis": {
        "name": "R Draconis", "ra": 248.16760, "dec": 66.75492,
        "note": "Mira variable near the north ecliptic pole (deep "
                "SPHEREx coverage); verified 1,258 epochs, "
                "2025-04-24 to 2026-09-27.",
    },
    "3i-atlas": {
        "name": "3I/ATLAS", "ra": 167.1309, "dec": 5.1732,
        "note": "Interstellar comet field - the Cipher-X Omega worked "
                "example. Frames are restricted to 2025-12-14, the "
                "morning the comet crossed this field (184 epochs cover "
                "the point across the full survey).",
        "restrict_dates": ["2025-12-14"],
    },
}

# Friendly lookup: lowercase fragment -> slug
ALIASES = {
    "barnard": "barnards-star", "barnards-star": "barnards-star",
    "barnard's star": "barnards-star", "barnards star": "barnards-star",
    "epsilon indi": "epsilon-indi", "epsilon-indi": "epsilon-indi",
    "eps ind": "epsilon-indi", "epsilon indi b": "epsilon-indi",
    "wise 0855": "wise-0855", "wise0855": "wise-0855",
    "wise j0855": "wise-0855",
    "rw aurigae": "rw-aurigae", "rw-aurigae": "rw-aurigae",
    "rw aur": "rw-aurigae",
    "r draconis": "r-draconis", "r-draconis": "r-draconis",
    "r dra": "r-draconis",
    "3i/atlas": "3i-atlas", "3iatlas": "3i-atlas",
    "3i-atlas": "3i-atlas", "atlas": "3i-atlas", "comet": "3i-atlas",
}


def resolve_star(name):
    """Map a free-form star name to a target slug, or None."""
    if not name:
        return None
    key = re.sub(r"\s+", " ", name.strip().lower())
    return ALIASES.get(key)


# ---------------------------------------------------------------- epochs

def find_epochs(ra, dec):
    """All level-2 SPHEREx epochs covering (ra, dec). Pipeline step 13.

    Returns a time-sorted list of dicts: obs_id, utc, t_min_mjd,
    collection, band_span_um, and planes (one entry per detector plane:
    {detector, access_url, band_um}).
    """
    import pyvo
    from astropy.time import Time

    q = ("SELECT obs_id, access_url, s_ra, s_dec, t_min, em_min, em_max, "
         "obs_collection FROM spherex.obscore "
         "WHERE dataproduct_type='image' AND calib_level=2 "
         f"AND CONTAINS(POINT('ICRS', {ra}, {dec}), s_region) = 1 "
         "ORDER BY t_min")
    rows = pyvo.dal.TAPService(TAP_URL).search(q)
    epochs = {}
    for r in rows:
        oid = str(r["obs_id"])
        url = str(r["access_url"])
        m = re.search(r"/(D\d)$", url)
        plane = {
            "detector": m.group(1) if m else None,
            "access_url": url,
            "band_um": [round(float(r["em_min"]) * 1e6, 3),
                        round(float(r["em_max"]) * 1e6, 3)],
        }
        e = epochs.setdefault(oid, {
            "obs_id": oid, "t_min_mjd": float(r["t_min"]),
            "collection": str(r["obs_collection"]), "planes": [],
        })
        e["planes"].append(plane)
    out = []
    for e in epochs.values():
        bands = sorted({tuple(p["band_um"]) for p in e["planes"]})
        e["band_span_um"] = [bands[0][0], bands[-1][1]] if bands else None
        e["utc"] = Time(e["t_min_mjd"], format="mjd").isot
        out.append(e)
    out.sort(key=lambda e: e["t_min_mjd"])
    return out


def select_spread(epochs, n=DEFAULT_FRAMES):
    """Pick ~n epochs spread across the full time span.

    SPHEREx revisits a field in visits (clusters of pointings hours to
    days apart, months between visits). Selection clusters epochs by
    20-day gaps, takes at least one frame per visit, and fills the
    remaining slots proportionally, so the series really does span the
    whole survey window instead of one busy week.
    """
    if len(epochs) <= n:
        return list(epochs)
    clusters = [[epochs[0]]]
    for e in epochs[1:]:
        if e["t_min_mjd"] - clusters[-1][-1]["t_min_mjd"] > 20.0:
            clusters.append([])
        clusters[-1].append(e)
    # Start with one per cluster (earliest), then round-robin by taking
    # evenly spaced extras from the biggest clusters until we reach n.
    chosen = [c[0] for c in clusters]
    pools = []
    for c in clusters:
        rest = c[1:]
        if rest:
            idx = np.linspace(0, len(rest) - 1,
                              num=min(len(rest), n)).astype(int)
            pools.append([rest[i] for i in sorted(set(idx))])
    flat = [e for pool in pools for e in pool]
    flat.sort(key=lambda e: e["t_min_mjd"])
    for e in flat:
        if len(chosen) >= n:
            break
        if e not in chosen:
            chosen.append(e)
    if len(chosen) < n:  # top up evenly from the full list
        idx = np.linspace(0, len(epochs) - 1, num=n).astype(int)
        for i in idx:
            if len(chosen) >= n:
                break
            if epochs[i] not in chosen:
                chosen.append(epochs[i])
    chosen.sort(key=lambda e: e["t_min_mjd"])
    return chosen[:n]


def pick_plane(epoch, prefer_detector=None):
    """One detector plane per epoch; prefer a consistent detector."""
    planes = epoch["planes"]
    if prefer_detector:
        for p in planes:
            if p["detector"] == prefer_detector:
                return p
    return planes[0]


# ------------------------------------------------------------- downloads

_UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) "
                     "watch-the-sky-backend/1.0 (Cipher-X Crew)"}
_LEVEL2_RE = re.compile(r"https://[^\s\"']*/level2/[^\s\"']*\.fits")
_SESSION = requests.Session()
_SESSION.headers.update(_UA)


def _get(url, timeout, stream=False):
    """GET with small retries - IRSA occasionally drops connections."""
    last = None
    for attempt in range(4):
        try:
            resp = _SESSION.get(url, timeout=timeout, stream=stream)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            last = e
            # IRSA's IBE returns 503s under burst load; back off properly
            time.sleep([10, 30, 60, 120][attempt])
    raise RuntimeError(f"GET failed after retries: {url} ({last})")


def resolve_fits_url(access_url):
    """DataLink URL -> direct level-2 FITS URL (IRSA IBE)."""
    text = _get(access_url, timeout=120).text
    m = _LEVEL2_RE.search(text)
    if not m:
        raise RuntimeError(f"no level-2 FITS link in DataLink for "
                           f"{access_url}")
    return m.group(0)


def download_cutout(fits_url, ra, dec, dest, size_deg=FIELD_SIZE_DEG):
    """IBE cutout of the FITS at (ra, dec), step-01 route.

    Written to a .part file first and size-checked against the
    response's Content-Length: IRSA streams sometimes end early, and a
    silently truncated FITS only fails much later, inside the renderer.
    """
    url = f"{fits_url}?center={ra},{dec}d&size={size_deg}"
    part = dest + ".part"
    last = None
    for attempt in range(4):
        try:
            resp = _get(url, timeout=600, stream=True)
            expected = resp.headers.get("Content-Length")
            with resp, open(part, "wb") as f:
                for chunk in resp.iter_content(1 << 20):
                    if chunk:
                        f.write(chunk)
            got = os.path.getsize(part)
            if expected is not None and got != int(expected):
                raise RuntimeError(
                    f"truncated download: {got} of {expected} bytes")
            os.replace(part, dest)
            return dest
        except Exception as e:
            last = e
            if os.path.exists(part):
                os.remove(part)
            time.sleep([10, 30, 60, 120][attempt])
    raise RuntimeError(f"cutout download failed: {url} ({last})")


def _fits_ok(path):
    """True if path opens as FITS with a readable IMAGE plane."""
    try:
        from astropy.io import fits
        with fits.open(path) as hdul:
            return hdul["IMAGE"].data is not None
    except Exception:
        return False


# -------------------------------------------------------------- pipeline

def build_series(ra, dec, work_dir, out_dir, n=DEFAULT_FRAMES,
                 restrict_dates=None, log=print):
    """Download, align and render a real frame series.

    work_dir: scratch space for downloaded FITS cutouts.
    out_dir:  where frame_XX.png + manifest.json are written.
    Returns the manifest dict (frames carry "file", not URLs - the API
    layer composes URLs so the same manifest works as a static pack).
    """
    from astropy.io import fits
    from reproject import reproject_interp

    os.makedirs(work_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    epochs = find_epochs(ra, dec)
    n_total = len(epochs)
    if not epochs:
        raise LookupError(f"no SPHEREx level-2 coverage for "
                          f"RA {ra}, Dec {dec} yet")
    if restrict_dates:
        epochs = [e for e in epochs
                  if e["utc"][:10] in restrict_dates] or epochs
    selected = select_spread(epochs, n)
    log(f"{n_total} epochs cover the point; "
        f"selected {len(selected)} frames")

    # Download one detector plane per epoch, detector-consistent.
    fits_paths, used, prefer = [], [], None
    for e in selected:
        plane = pick_plane(e, prefer)
        if prefer is None:
            prefer = plane["detector"]
        dest = os.path.join(
            work_dir, f"{e['obs_id']}_{plane['detector']}.fits")
        if os.path.exists(dest) and not _fits_ok(dest):
            os.remove(dest)  # corrupt/truncated cache entry: refetch
        if not os.path.exists(dest):
            fits_url = resolve_fits_url(plane["access_url"])
            log(f"download {e['obs_id']} {plane['detector']} "
                f"{e['utc'][:10]}")
            download_cutout(fits_url, ra, dec, dest)
            time.sleep(3)  # pace requests; IBE throttles bursts
        fits_paths.append(dest)
        used.append((e, plane))

    # Align every frame onto the first frame's WCS grid (step 01).
    with fits.open(fits_paths[0]) as hdul:
        ref_header = hdul["IMAGE"].header
    frames = []
    for p in fits_paths:
        with fits.open(p) as hdul:
            arr, _ = reproject_interp(hdul["IMAGE"], ref_header)
        arr = np.asarray(arr, dtype=np.float64)
        arr -= np.nanmedian(arr)
        frames.append(arr)
    stack = np.array(frames)

    # Render: asinh stretch, GLOBAL scale and max (brightness changes
    # between epochs stay visible), subtle blue tint, 900x900.
    from PIL import Image

    scale = np.nanpercentile(stack, 99.9)
    stretched = np.arcsinh(np.clip(stack, 0, None) / (0.02 * scale))
    vmax = np.nanmax(stretched) if stretched.size else 0.0
    if not np.isfinite(vmax) or vmax <= 0:
        raise RuntimeError("rendering failed: empty stretch range")
    tint = np.array([0.80, 0.89, 1.00])
    manifest_frames = []
    for i, (e, plane) in enumerate(used, start=1):
        v = np.nan_to_num(stretched[i - 1] / vmax)
        rgb = (np.dstack([v * t for t in tint]) * 255).astype(np.uint8)
        fname = f"frame_{i:02d}.png"
        Image.fromarray(rgb).resize(
            (DISPLAY_PX, DISPLAY_PX), Image.BILINEAR).save(
            os.path.join(out_dir, fname))
        manifest_frames.append({
            "index": i,
            "utc": e["utc"],
            "obs_id": e["obs_id"],
            "collection": e["collection"],
            "detector": plane["detector"],
            "band_um": plane["band_um"],
            "file": fname,
        })
    manifest = {
        "ra_deg": ra,
        "dec_deg": dec,
        "field_size_deg": FIELD_SIZE_DEG,
        "display_px": DISPLAY_PX,
        "n_epochs_total": n_total,
        "n_frames": len(manifest_frames),
        "frames": manifest_frames,
        "source": "NASA/IPAC Infrared Science Archive (IRSA) - SPHEREx "
                  "level-2 images via IBE cutouts; frames reprojected "
                  "onto a common grid, median-background subtracted, "
                  "asinh-stretched with one global scale per series.",
        "credit": "SPHEREx / NASA / IRSA",
    }
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    return manifest


def slug_for_patch(ra, dec):
    return f"patch-{ra:.4f}-{dec:+.4f}".replace("+", "p").replace("-", "m") \
        .replace(".", "_")
