import { useEffect, useRef, useState } from 'react';

/**
 * RealDataExplorer — plays REAL SPHEREx frames produced by the project
 * backend (backend/spherex.py) and stored as static data packs in this
 * repository under backend/static_data/<slug>/.
 *
 * Each pack holds 12 real frames sampled from the NASA/IRSA SPHEREx
 * archive plus a manifest.json describing every frame (UTC, detector,
 * wavelength band, observation id). Packs are loaded from the repo
 * itself (same-origin static path first, then the raw GitHub URL), so
 * the viewer works wherever the site is hosted.
 */

export interface RealTarget {
  slug: string;
  name: string;
  category: string;
  blurb: string;
}

export const REAL_TARGETS: RealTarget[] = [
  {
    slug: '3i-atlas',
    name: '3I/ATLAS',
    category: 'Interstellar Comet',
    blurb:
      'The interstellar comet at the centre of the Cipher-X Omega study — twelve real SPHEREx frames from a single morning, 14 December 2025, as it crossed the detector array.',
  },
  {
    slug: 'barnards-star',
    name: "Barnard's Star",
    category: 'High Proper Motion Star',
    blurb:
      'The fastest-moving star in our sky. Twelve real SPHEREx frames sampled from the 183 epochs the archive holds on this field.',
  },
  {
    slug: 'epsilon-indi',
    name: 'Epsilon Indi',
    category: 'Brown Dwarf Host Star',
    blurb:
      'A nearby K-type star with a brown-dwarf pair. Twelve real SPHEREx frames sampled from 238 archive epochs.',
  },
  {
    slug: 'wise-0855',
    name: 'WISE 0855',
    category: 'Cold Brown Dwarf',
    blurb:
      'One of the coldest known brown dwarfs, 7.2 light-years away. Twelve real SPHEREx frames sampled from 129 archive epochs.',
  },
  {
    slug: 'rw-aurigae',
    name: 'RW Aurigae',
    category: 'Young Variable Star',
    blurb:
      'A young star known for dramatic dimming events. Twelve real SPHEREx frames sampled from 168 archive epochs.',
  },
  {
    slug: 'r-draconis',
    name: 'R Draconis',
    category: 'Mira Variable Star',
    blurb:
      'A pulsating red giant. Twelve real SPHEREx frames sampled from 1,258 archive epochs — the deepest coverage of the five test targets.',
  },
];

interface ManifestFrame {
  index: number;
  utc: string;
  obs_id: string;
  collection: string;
  detector: string;
  band_um: [number, number];
  file: string;
}

interface Manifest {
  ra_deg: number;
  dec_deg: number;
  field_size_deg: number;
  n_epochs_total: number;
  n_frames: number;
  frames: ManifestFrame[];
}

const DATA_BASES = [
  'backend/static_data',
  'https://raw.githubusercontent.com/sanaasif1217/cipher-x-crew/main/backend/static_data',
];

async function loadPack(slug: string): Promise<{ manifest: Manifest; base: string }> {
  let lastError: unknown = null;
  for (const base of DATA_BASES) {
    try {
      const res = await fetch(`${base}/${slug}/manifest.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = (await res.json()) as Manifest;
      return { manifest, base: `${base}/${slug}` };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('Could not load data pack');
}

interface RealDataExplorerProps {
  /** Slug chosen elsewhere on the page (e.g. a star card); viewer follows it. */
  requestedSlug?: string;
}

export function RealDataExplorer({ requestedSlug }: RealDataExplorerProps) {
  const [target, setTarget] = useState<RealTarget>(REAL_TARGETS[0]);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [base, setBase] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [frameIdx, setFrameIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.9); // seconds per frame
  const timerRef = useRef<number | null>(null);

  // Follow selections made elsewhere on the page (star cards)
  useEffect(() => {
    if (!requestedSlug) return;
    const t = REAL_TARGETS.find((x) => x.slug === requestedSlug);
    if (t) setTarget(t);
  }, [requestedSlug]);

  // Load the selected target's data pack
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setIsPlaying(false);
    setFrameIdx(0);
    loadPack(target.slug)
      .then(({ manifest: m, base: b }) => {
        if (cancelled) return;
        setManifest(m);
        setBase(b);
        setStatus('ready');
        m.frames.forEach((f) => {
          const img = new Image();
          img.src = `${b}/${f.file}`;
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !manifest) return;
    timerRef.current = window.setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % manifest.frames.length);
    }, Math.max(150, speed * 1000));
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isPlaying, manifest, speed]);

  const frame = manifest?.frames[frameIdx];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 text-[#f5efe2]">
      <div className="bg-[#121622]/90 backdrop-blur-md border border-[#f5efe2]/15 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="mb-6 pb-4 border-b border-[#f5efe2]/10">
          <div className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono tracking-widest uppercase mb-2">
            Real SPHEREx Data · NASA / IRSA Archive
          </div>
          <h2
            className="text-2xl sm:text-3xl font-normal tracking-tight"
            style={{ fontFamily: 'Antonio, sans-serif' }}
          >
            Watch the Sky — Real Frames
          </h2>
          <p className="text-sm text-[#f5efe2]/70 mt-1 max-w-xl">
            No simulation: these are actual SPHEREx survey images, fetched from the archive by the
            project backend and stored in this repository. Pick a target and play the sky changing.
          </p>
        </div>

        {/* Target picker */}
        <div className="mb-6">
          <span className="block text-xs uppercase tracking-wider text-[#f5efe2]/60 mb-2 font-mono">
            Targets with real data packs
          </span>
          <div className="flex flex-wrap gap-2">
            {REAL_TARGETS.map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => setTarget(t)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all border ${
                  target.slug === t.slug
                    ? 'bg-[#f5efe2] text-[#0a0d16] border-[#f5efe2] font-semibold shadow-lg'
                    : 'bg-[#1a2032] text-[#f5efe2]/80 border-[#f5efe2]/15 hover:border-[#f5efe2]/40 hover:bg-[#222a40]'
                }`}
              >
                <span>{t.name}</span>
                <span className="block text-[10px] opacity-60 font-mono mt-0.5">{t.category}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Frame viewer */}
          <div className="lg:col-span-2 relative aspect-square max-h-[560px] w-full bg-[#030408] rounded-2xl overflow-hidden border border-[#f5efe2]/20 shadow-inner flex items-center justify-center">
            {status === 'ready' && frame && (
              <img
                src={`${base}/${frame.file}`}
                alt={`SPHEREx frame ${frame.index} of ${target.name}, observed ${frame.utc} UTC`}
                className="w-full h-full object-contain"
              />
            )}
            {status === 'loading' && (
              <p className="text-sm font-mono text-[#f5efe2]/60">Loading real SPHEREx frames…</p>
            )}
            {status === 'error' && (
              <p className="text-sm font-mono text-red-300 px-6 text-center">
                Could not load the data pack for {target.name}. Check your connection and try again.
              </p>
            )}
            {status === 'ready' && manifest && (
              <div className="absolute bottom-3 right-3 bg-[#0a0d16]/80 backdrop-blur-md px-3 py-1 rounded-lg border border-[#f5efe2]/15 text-[11px] font-mono text-[#f5efe2]/80">
                Frame {frameIdx + 1} of {manifest.frames.length}
              </div>
            )}
          </div>

          {/* Info & controls */}
          <div className="space-y-4 bg-[#0a0d16] p-5 rounded-2xl border border-[#f5efe2]/10">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-emerald-300 uppercase tracking-wider">
                  {target.category}
                </span>
                <span className="text-xs font-mono text-[#f5efe2]/50">IRSA SPHEREx</span>
              </div>
              <h3 className="text-xl font-medium text-[#f5efe2] mb-1">{target.name}</h3>
              <p className="text-xs text-[#f5efe2]/75 leading-relaxed">{target.blurb}</p>
            </div>

            {manifest && frame && (
              <dl className="text-[11px] font-mono text-[#f5efe2]/70 space-y-1.5 border-t border-[#f5efe2]/10 pt-3">
                <div className="flex justify-between gap-2">
                  <dt className="text-[#f5efe2]/45">OBSERVED (UTC)</dt>
                  <dd>{frame.utc.replace('T', ' ').slice(0, 19)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#f5efe2]/45">DETECTOR</dt>
                  <dd>
                    {frame.detector} · {frame.band_um[0].toFixed(2)}–{frame.band_um[1].toFixed(2)} µm
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#f5efe2]/45">FIELD CENTRE</dt>
                  <dd>
                    RA {manifest.ra_deg.toFixed(4)}° · Dec {manifest.dec_deg.toFixed(4)}°
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#f5efe2]/45">ARCHIVE EPOCHS</dt>
                  <dd>{manifest.n_epochs_total} total · 12 shown</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#f5efe2]/45">OBS ID</dt>
                  <dd className="truncate">{frame.obs_id}</dd>
                </div>
              </dl>
            )}

            {manifest && (
              <div>
                <div className="flex justify-between text-[11px] font-mono text-[#f5efe2]/60 mb-1.5">
                  <span>FRAME TIMELINE</span>
                  <span>
                    {frameIdx + 1} / {manifest.frames.length}
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {manifest.frames.map((f, idx) => (
                    <button
                      key={f.index}
                      type="button"
                      onClick={() => {
                        setFrameIdx(idx);
                        setIsPlaying(false);
                      }}
                      className={`h-9 rounded-lg font-mono text-xs font-semibold transition-all border ${
                        frameIdx === idx
                          ? 'bg-[#3b82f6] text-white border-[#3b82f6] shadow-md'
                          : 'bg-[#161c2d] text-[#f5efe2]/70 border-[#f5efe2]/15 hover:border-[#f5efe2]/40'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-[#f5efe2]/10">
              <button
                type="button"
                disabled={status !== 'ready'}
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex-1 bg-[#f5efe2] hover:bg-[#e2d8c5] disabled:opacity-40 text-[#0a0d16] font-semibold text-xs py-2.5 px-4 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
              >
                {isPlaying ? (
                  <>
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>Play Real Frames</span>
                  </>
                )}
              </button>
            </div>

            <div className="pt-1">
              <div className="flex justify-between text-[11px] font-mono text-[#f5efe2]/60 mb-1">
                <span>PLAYBACK INTERVAL</span>
                <span>{speed.toFixed(1)}s / frame</span>
              </div>
              <input
                type="range"
                min="0.3"
                max="2.5"
                step="0.1"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-[#3b82f6] cursor-pointer"
              />
            </div>

            <p className="text-[11px] text-[#f5efe2]/45 leading-relaxed border-t border-[#f5efe2]/10 pt-3">
              Frames: NASA/IPAC Infrared Science Archive (IRSA), SPHEREx level-2 data, retrieved and
              rendered by the backend in this repo (<span className="font-mono">backend/</span>).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
