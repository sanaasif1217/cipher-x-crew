# Watch the Sky — real-data backend

A small Python backend that feeds the **Watch the Sky** front-end *real*
SPHEREx images instead of simulated ones. Give it a star name or a pair of
coordinates and it returns a time series of real SPHEREx level-2 frames of
that patch of sky — ready to play like a little video.

Built by the Cipher-X Crew for the NASA Space Apps Challenge 2026
("Planet X and SPHEREx"). The data plumbing is the team's verified
Cipher-X Omega pipeline: epoch finding is pipeline step 13, frame
downloads use the step-01 IRSA IBE cutout route.

## What it does

1. **Finds epochs** — queries the IRSA archive (TAP, `spherex.obscore`)
   for every level-2 SPHEREx image whose footprint contains the
   requested RA/Dec.
2. **Picks ~12 frames spread across the whole time span** (one per
   survey visit where possible), so playing the series shows months of
   change, not one busy morning.
3. **Downloads real cutouts** (0.5° field) from IRSA's IBE service,
   reprojects them onto one common grid, subtracts each frame's median
   background, and renders 900×900 PNGs. One global brightness scale is
   used for the whole series, so a variable star really brightens and
   fades between frames.
4. **Serves a manifest** — JSON listing every frame's UTC time, detector
   and wavelength band, plus the frame's URL.

## Files

| File | What it is |
|---|---|
| `app.py` | The FastAPI web service (the API below) |
| `spherex.py` | The data core: archive query, downloads, alignment, rendering |
| `pregenerate.py` | Builds static data packs for the 6 known targets (no server needed) |
| `static_data/<slug>/` | Pre-generated packs: `frame_01.png` … + `manifest.json` |
| `requirements.txt` | Python dependencies |

## Run it

```bash
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Then open `http://localhost:8000/health` — it should answer
`{"status": "ok", ...}`.

## API

- `GET /health` — service status, which static packs exist, known targets.
- `GET /api/star?name=Barnard's Star` — frame series for a known target.
  Known names: Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae,
  R Draconis, 3I/ATLAS. Add `&n=12` to change the frame count (max 16).
- `GET /api/patch?ra=269.45208&dec=4.69339` — frame series for any
  coordinates (degrees). First request for a new patch is slow (archive
  query + downloads); the result is cached, later requests are instant.
- `GET /frames/<slug>/frame_01.png` — the frame images themselves.

Every `/api/...` answer is a **manifest**:

```json
{
  "target": "Barnard's Star",
  "slug": "barnards-star",
  "ra_deg": 269.45208,
  "dec_deg": 4.69339,
  "field_size_deg": 0.5,
  "n_epochs_total": 183,
  "n_frames": 12,
  "frames": [
    {"index": 1, "utc": "2025-08-15T20:45:11.376", "obs_id": "…",
     "detector": "D5", "band_um": [3.9, 5.0],
     "url": "http://localhost:8000/frames/barnards-star/frame_01.png"}
  ],
  "credit": "SPHEREx / NASA / IRSA"
}
```

CORS is open (`allow_origins=["*"]`), so a browser front-end on any
domain can call the API.

## No-server option (recommended for demo day)

```bash
python pregenerate.py            # builds all six packs
python pregenerate.py --target wise-0855
```

Copy `static_data/*` into the website's public folder. The front-end
then just fetches `<slug>/manifest.json` and plays the PNGs — plain
static files, nothing to host, nothing to crash.

## Deploying the live API (optional)

- **Hugging Face Spaces**: new Space → Docker → expose port 8000,
  start command `uvicorn app:app --host 0.0.0.0 --port 8000`.
- **Render**: new Web Service from this repo, build
  `pip install -r requirements.txt`, start command as above.

Free tiers sleep when idle — that's why the pre-generated packs above
are the safe primary path for a judged demo.

## Data & credit

All imagery: SPHEREx level-2 data from the NASA/IPAC Infrared Science
Archive (IRSA), collections `spherex_qr2 / spherex_dr1 / spherex_qr3`,
via IBE cutouts. Credit: SPHEREx / NASA / IRSA.
