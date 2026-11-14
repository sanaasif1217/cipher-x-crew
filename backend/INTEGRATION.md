# Integration notes — for Sujal (front-end)

Hi Sujal — this backend gives your Observatory **real SPHEREx frames**
to play instead of the simulated canvas sky. Two ways to use it; the
first needs no server at all.

## Option A — static packs (simplest, demo-safe)

1. Run `python pregenerate.py` once (or take the ready `static_data/`
   folder as delivered).
2. Copy `static_data/*` into your site's public/static folder.
3. In the Observatory, when a benchmark star is picked, load
   `<slug>/manifest.json`, then play `frames[i].file` in order with
   your existing play/pause + slider controls. The manifest's
   `frames[i].utc` and `frames[i].band_um` can drive your epoch label
   and the "spectral filter" readout with *real* values.

Slugs: `barnards-star`, `epsilon-indi`, `wise-0855`, `rw-aurigae`,
`r-draconis`, `3i-atlas`.

```js
async function loadRealSeries(slug) {
  const res = await fetch(`/data/${slug}/manifest.json`);
  const manifest = await res.json();
  return manifest.frames.map(f => ({
    src: `/data/${slug}/${f.file}`,
    utc: f.utc,
    band: f.band_um,        // real [min, max] wavelength in microns
    detector: f.detector,   // e.g. "D2"
  }));
}
```

## Option B — live API

Run the backend (see README) and point the front-end at it:

```js
const API = "http://localhost:8000";   // or the deployed URL

async function loadStar(name) {
  const res = await fetch(`${API}/api/star?name=${encodeURIComponent(name)}`);
  return res.json();   // manifest; use frames[i].url directly as <img> src
}

async function loadPatch(ra, dec) {
  const res = await fetch(`${API}/api/patch?ra=${ra}&dec=${dec}`);
  return res.json();
}
```

- Benchmark-star requests answer instantly when a static pack exists.
- A brand-new patch can take a minute or two the first time (archive
  query + real downloads) — show your loading state; it's cached after
  that.
- Errors come back as `{"error": "..."}` with a 4xx/5xx status —
  e.g. a patch with no SPHEREx coverage yet returns 404 with a clear
  message you can show the user.

## What changed vs the simulator

- Frames are real 0.5° SPHEREx level-2 cutouts, all reprojected onto
  one grid, so stars stay registered and only real changes show.
- One global brightness scale per series: RW Aurigae and R Draconis
  genuinely brighten/fade across frames — no per-frame renormalising.
- Epochs span the star's real survey window (e.g. Barnard's Star:
  183 epochs in the archive, Aug 2025 → Sep 2026; the pack plays 12
  spread across that span).

Questions → ask Sana, or check `README.md` for the full API contract.
— Cipher-X Crew
