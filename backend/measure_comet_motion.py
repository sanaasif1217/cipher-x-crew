#!/usr/bin/env python3
"""
Measure the motion of comet 3I/ATLAS on its own data-pack frames.

The pack frames are registered renders of real SPHEREx level-2 data
(900x900 px over a 0.5 degree field centred on RA 167.1309, Dec +5.1732,
so the plate scale is exactly 2 arcsec/px, north up, east left).

Method: the comet's position at every pack epoch is predicted from the
project's independently validated ephemeris (a linear fit to the
underlying SPHEREx epochs, checked against JPL Horizons to <=0.33
arcsec: rate 1.167 deg/day, PA 289.3 deg, epoch-1 position RA
167.279208, Dec +5.121562 at 2025-12-14T04:26:46 UTC). Around each
prediction we centroid the comet's actual light in the pack frame
itself (61x61 px window, local background from the window border).
A fresh linear fit to those measured centroids gives the motion as
measured on THIS project's shipped frames — rate, position angle and
fit RMS — which can be compared with the ephemeris.

Frames whose predicted position falls outside the field are skipped
(the comet leaves the 0.5-degree field after ~13 hours).

Output: motion_result.json next to the pack's manifest.json.

Usage:
    python measure_comet_motion.py [pack_dir]
    (default pack_dir: static_data/3i-atlas beside this script)

Requires: numpy, Pillow.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

# --- Validated ephemeris (Cipher-X Omega pipeline, JPL Horizons check) ---
EPOCH1_UTC = "2025-12-14T04:26:46"
RA_AT_EPOCH1 = 167.27920807208744
DEC_AT_EPOCH1 = 5.121562309539274
RA_RATE_ONSKY_DEG_DAY = -1.101877416061618   # east-positive, on-sky
DEC_RATE_DEG_DAY = 0.3851898842507471
REF_RATE_DEG_DAY = 1.167
REF_PA_DEG = 289.3

FIELD_CENTRE_RA = 167.1309
FIELD_CENTRE_DEC = 5.1732
PX_PER_DEG = 1800.0          # 900 px / 0.5 deg
PLATE_SCALE_ARCSEC = 2.0
WINDOW = 30                  # half-size of the centroid window, px


def load_frame(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    return np.asarray(img, dtype=np.float32).mean(axis=2)


def predict_px(t_hours: float) -> tuple[float, float]:
    days = t_hours / 24.0
    cos_dec = np.cos(np.radians(DEC_AT_EPOCH1))
    ra = RA_AT_EPOCH1 + (RA_RATE_ONSKY_DEG_DAY / cos_dec) * days
    dec = DEC_AT_EPOCH1 + DEC_RATE_DEG_DAY * days
    dra_arcsec = (ra - FIELD_CENTRE_RA) * cos_dec * 3600.0
    ddec_arcsec = (dec - FIELD_CENTRE_DEC) * 3600.0
    px = 450.0 - dra_arcsec / PLATE_SCALE_ARCSEC   # east is left
    py = 450.0 - ddec_arcsec / PLATE_SCALE_ARCSEC  # north is up
    return px, py


def centroid_window(img: np.ndarray, cx: float, cy: float):
    """Flux-weighted centroid of the source near (cx, cy)."""
    x0, x1 = int(round(cx)) - WINDOW, int(round(cx)) + WINDOW + 1
    y0, y1 = int(round(cy)) - WINDOW, int(round(cy)) + WINDOW + 1
    if x0 < 0 or y0 < 0 or x1 > img.shape[1] or y1 > img.shape[0]:
        return None
    win = img[y0:y1, x0:x1].copy()
    border = np.concatenate([win[0, :], win[-1, :], win[:, 0], win[:, -1]])
    bg = float(np.median(border))
    excess = win - bg
    noise = 1.4826 * np.median(np.abs(border - bg)) + 1e-6
    weights = np.clip(excess - 2.0 * noise, 0.0, None)
    total = float(weights.sum())
    if total <= 0:
        return None
    yy, xx = np.mgrid[y0:y1, x0:x1]
    mx = float((weights * xx).sum() / total)
    my = float((weights * yy).sum() / total)
    peak = float(excess.max())
    return mx, my, peak, noise


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    pack_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else script_dir / "static_data" / "3i-atlas"
    manifest = json.loads((pack_dir / "manifest.json").read_text())
    frames_meta = manifest["frames"]
    t_ref = datetime.fromisoformat(EPOCH1_UTC).replace(tzinfo=timezone.utc).timestamp()

    rows = []
    for meta in frames_meta:
        t = datetime.fromisoformat(meta["utc"]).replace(tzinfo=timezone.utc).timestamp()
        hours = (t - t_ref) / 3600.0
        px, py = predict_px(hours)
        img = load_frame(pack_dir / meta["file"])
        got = centroid_window(img, px, py)
        row = {"frame": meta["index"], "utc": meta["utc"], "hours": round(hours, 3),
               "predicted_px": [round(px, 1), round(py, 1)]}
        if got is not None:
            row["measured_px"] = [round(got[0], 2), round(got[1], 2)]
            row["offset_from_prediction_px"] = round(float(np.hypot(got[0] - px, got[1] - py)), 2)
            row["peak_excess"] = round(got[2], 1)
        rows.append(row)
        print(row)

    meas = [r for r in rows if "measured_px" in r]
    if len(meas) < 3:
        print("ERROR: too few measurable frames")
        return 1
    tt = np.array([r["hours"] for r in meas])
    xx = np.array([r["measured_px"][0] for r in meas])
    yy = np.array([r["measured_px"][1] for r in meas])
    cx = np.polyfit(tt, xx, 1)
    cy = np.polyfit(tt, yy, 1)
    resid = np.hypot(xx - np.polyval(cx, tt), yy - np.polyval(cy, tt))
    rms_arcsec = float(np.sqrt(np.mean(resid ** 2)) * PLATE_SCALE_ARCSEC)

    rate_px_hr = np.array([cx[0], cy[0]])
    rate_arcsec_hr = float(np.hypot(*rate_px_hr) * PLATE_SCALE_ARCSEC)
    rate_deg_day = rate_arcsec_hr * 24.0 / 3600.0
    d_ra = -rate_px_hr[0] * PLATE_SCALE_ARCSEC
    d_dec = -rate_px_hr[1] * PLATE_SCALE_ARCSEC
    pa_deg = float((np.degrees(np.arctan2(d_ra, d_dec)) + 360.0) % 360.0)
    span = float(tt.max() - tt.min())

    result = {
        "target": "3I/ATLAS (interstellar comet)",
        "measured_on": "the 3i-atlas data pack's own rendered frames (900x900 px, 2 arcsec/px), centroided in a 61x61 px window around the ephemeris prediction",
        "frames_measured": [r["frame"] for r in meas],
        "frames_in_pack": len(frames_meta),
        "fit_baseline_hours": round(span, 2),
        "displacement_arcsec": round(rate_arcsec_hr * span, 1),
        "rate_arcsec_per_hour": round(rate_arcsec_hr, 1),
        "rate_deg_per_day": round(rate_deg_day, 3),
        "position_angle_deg": round(pa_deg, 1),
        "fit_rms_arcsec": round(rms_arcsec, 2),
        "positions": rows,
        "reference": {
            "rate_deg_per_day": REF_RATE_DEG_DAY,
            "position_angle_deg": REF_PA_DEG,
            "source": "Independent fit to the underlying SPHEREx epochs, validated against JPL Horizons to <=0.33 arcsec (Cipher-X Omega pipeline)",
        },
    }
    print(json.dumps({k: v for k, v in result.items() if k != "positions"}, indent=2))
    (pack_dir / "motion_result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"wrote {pack_dir / 'motion_result.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
