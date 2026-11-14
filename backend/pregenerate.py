#!/usr/bin/env python
"""Pre-generate static real-data packs for Watch the Sky.

Builds static_data/<slug>/ (frame_XX.png + manifest.json) for the five
benchmark stars and the 3I/ATLAS comet field, using exactly the same
code path as the live API (spherex.build_series). With these packs the
front-end needs NO live server: copy static_data/* into the site's
public folder and fetch <slug>/manifest.json.

Usage:
    python pregenerate.py                 # all six targets
    python pregenerate.py --target wise-0855
    python pregenerate.py --force         # rebuild existing packs
    python pregenerate.py --n 12          # frames per target (max 16)

Downloads are the slow part (IRSA TAP query + one IBE cutout per
frame); FITS scratch files are kept in work/ so re-runs are cheap.
"""
import argparse
import json
import os
import sys

import spherex

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(ROOT, "static_data")
WORK_DIR = os.path.join(ROOT, "work")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default=None,
                    help="single slug (default: all six targets)")
    ap.add_argument("--n", type=int, default=spherex.DEFAULT_FRAMES)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    n = max(1, min(args.n, spherex.MAX_FRAMES))

    slugs = [args.target] if args.target else list(spherex.TARGETS)
    for slug in slugs:
        t = spherex.TARGETS[slug]
        out_dir = os.path.join(STATIC_DIR, slug)
        if os.path.exists(os.path.join(out_dir, "manifest.json")) \
                and not args.force:
            print(f"[{slug}] pack exists, skipping (use --force)")
            continue
        print(f"[{slug}] {t['name']} RA {t['ra']} Dec {t['dec']}")
        try:
            manifest = spherex.build_series(
                t["ra"], t["dec"],
                work_dir=os.path.join(WORK_DIR, slug),
                out_dir=out_dir, n=n,
                restrict_dates=t.get("restrict_dates"),
                log=lambda *a: print("   ", *a))
        except Exception as e:
            print(f"[{slug}] FAILED: {e}", file=sys.stderr)
            continue
        manifest["target"] = t["name"]
        manifest["slug"] = slug
        manifest["note"] = t["note"]
        with open(os.path.join(out_dir, "manifest.json"), "w") as f:
            json.dump(manifest, f, indent=1)
        size = sum(os.path.getsize(os.path.join(out_dir, fn))
                   for fn in os.listdir(out_dir))
        print(f"[{slug}] done: {manifest['n_frames']} frames, "
              f"{manifest['n_epochs_total']} epochs in archive, "
              f"pack {size/1e6:.2f} MB")


if __name__ == "__main__":
    main()
