# Watch the Sky — Cipher-X Crew

**NASA Space Apps Challenge 2026 · "NASA SPHEREx and Planet X"**

**Project repository:** https://github.com/sanaasif1217/cipher-x-crew

Watch the Sky makes it easy for anyone to see how a patch of sky changes
over time in real SPHEREx survey images — no astronomy background needed.
Pick one of the challenge's benchmark targets (or the interstellar comet
3I/ATLAS) and play actual NASA archive frames back like a film.

## What's real here

The **"Watch the Sky — Real Frames"** section of the site is connected to
the project backend in this repository:

- `backend/` — a Python/FastAPI service whose data core queries the
  NASA/IPAC Infrared Science Archive (IRSA) for SPHEREx level-2 images,
  downloads cutouts, registers them on a common grid and renders them as
  web-ready frames.
- `backend/static_data/` — pre-generated data packs: **6 targets × 12 real
  frames**, each with a `manifest.json` giving the observation time,
  detector and wavelength band of every frame.
- The website loads these packs directly (repository path first, then the
  raw GitHub URL), so the real frames play on any hosting — no server
  required. Running the backend is optional and only needed to generate
  packs for *new* coordinates.

The 3D starfield journey and the "Sky Time-Lapse & Coordinate Explorer"
are presentation/simulation pieces; the Real Frames viewer is the part
showing genuine archive data.

## Targets with real data packs

| Target | Archive epochs | Pack |
| --- | --- | --- |
| 3I/ATLAS (interstellar comet) | 184 | `backend/static_data/3i-atlas` |
| Barnard's Star | 183 | `backend/static_data/barnards-star` |
| Epsilon Indi | 238 | `backend/static_data/epsilon-indi` |
| WISE 0855 | 129 | `backend/static_data/wise-0855` |
| RW Aurigae | 168 | `backend/static_data/rw-aurigae` |
| R Draconis | 1,258 | `backend/static_data/r-draconis` |

## Run the website

```bash
bun install        # the project uses Bun (bun.lock)
bun run dev        # http://localhost:3000
```

With npm instead: `npm install --legacy-peer-deps` then `npm run dev`.

## Run the backend (optional)

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

- `GET /health` — service status
- `GET /api/star?name=barnards-star` — a target's frame pack
- `GET /api/patch?ra=167.1309&dec=5.1732` — generate a pack for any coordinates
- `python pregenerate.py` — rebuild all static packs from the archive

See `backend/README.md` and `backend/INTEGRATION.md` for details.

## Data sources

- NASA/IPAC Infrared Science Archive (IRSA) — SPHEREx level-2 images and
  observation metadata
- NASA SPHEREx mission (JPL / Caltech)

## Team — Cipher-X Crew

Six members, two countries — Pakistan and India.

- **Sana Asif — Team Leader**
- Sherdil Khan — Team Member
- Naheed Nawaz — Team Member
- Abdul Qadoos — Team Member
- Abdullah — Team Member
- Sujal Khanolkar — Team Member

Built for the NASA Space Apps Challenge 2026.
