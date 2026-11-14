import { useEffect, useRef, useState } from 'react';

/**
 * RealDataExplorer — plays and analyses REAL SPHEREx frames produced by
 * the project backend (backend/spherex.py) and stored as static data
 * packs in this repository under backend/static_data/<slug>/.
 *
 * Each pack holds 12 real frames sampled from the NASA/IRSA SPHEREx
 * archive plus a manifest.json describing every frame (UTC, detector,
 * wavelength band, observation id). Packs are loaded from the repo
 * itself (same-origin static path first, then the raw GitHub URL), so
 * the viewer works wherever the site is hosted.
 *
 * Beyond playback, the viewer measures the frames in the browser:
 * per-frame brightness statistics with a brightness-over-time chart,
 * a difference view (frame minus frame 1) that highlights anything
 * that moved or changed, a filterable epoch table, and a side-by-side
 * comparison of any two targets.
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

interface FrameStat {
  mean: number;
  max: number;
}

interface PackData {
  manifest: Manifest;
  base: string;
  stats: FrameStat[];
  /** Per-frame luminance at GRAY_SIZE x GRAY_SIZE, for the difference view. */
  gray: Uint8ClampedArray[];
}

const DATA_BASES = [
  'backend/static_data',
  'https://raw.githubusercontent.com/sanaasif1217/cipher-x-crew/main/backend/static_data',
];

const GRAY_SIZE = 512;

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${src}`));
    img.src = src;
  });
}

/** Download a pack and measure every frame (brightness stats + luminance). */
async function buildPack(slug: string): Promise<PackData> {
  const { manifest, base } = await loadPack(slug);
  const canvas = document.createElement('canvas');
  canvas.width = GRAY_SIZE;
  canvas.height = GRAY_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas unavailable');

  const stats: FrameStat[] = [];
  const gray: Uint8ClampedArray[] = [];
  for (const f of manifest.frames) {
    const img = await loadImage(`${base}/${f.file}`);
    ctx.drawImage(img, 0, 0, GRAY_SIZE, GRAY_SIZE);
    const data = ctx.getImageData(0, 0, GRAY_SIZE, GRAY_SIZE).data;
    const g = new Uint8ClampedArray(GRAY_SIZE * GRAY_SIZE);
    let sum = 0;
    let max = 0;
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      g[j] = lum;
      sum += lum;
      if (lum > max) max = lum;
    }
    gray.push(g);
    stats.push({ mean: sum / g.length, max });
  }
  return { manifest, base, stats, gray };
}

const packCache = new Map<string, Promise<PackData>>();

function getPack(slug: string): Promise<PackData> {
  const hit = packCache.get(slug);
  if (hit) return hit;
  const pending = buildPack(slug);
  packCache.set(slug, pending);
  pending.catch(() => packCache.delete(slug));
  return pending;
}

function fmtUtc(utc: string): string {
  return utc.replace('T', ' ').slice(0, 19);
}

function dateSpan(manifest: Manifest): string {
  const first = manifest.frames[0]?.utc.slice(0, 10) ?? '';
  const last = manifest.frames[manifest.frames.length - 1]?.utc.slice(0, 10) ?? '';
  return first === last ? first : `${first} → ${last}`;
}

function brightnessChange(stats: FrameStat[]): number {
  if (stats.length < 2 || stats[0].mean === 0) return 0;
  return ((stats[stats.length - 1].mean - stats[0].mean) / stats[0].mean) * 100;
}

/* ---------------- Brightness chart ---------------- */

function BrightnessChart({
  stats,
  frameIdx,
  onSelect,
  height = 96,
}: {
  stats: FrameStat[];
  frameIdx: number;
  onSelect?: (idx: number) => void;
  height?: number;
}) {
  const W = 300;
  const H = height;
  const PAD = 10;
  const means = stats.map((s) => s.mean);
  const min = Math.min(...means);
  const max = Math.max(...means);
  const span = max - min || 1;
  const denom = Math.max(1, means.length - 1);
  const pts = means.map((m, i) => {
    const x = PAD + (i * (W - 2 * PAD)) / denom;
    const y = H - PAD - ((m - min) / span) * (H - 2 * PAD);
    return [x, y] as const;
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Mean frame brightness over time">
      <path d={path} fill="none" stroke="#60a5fa" strokeWidth="1.8" />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={i === frameIdx ? 4.2 : 2.6}
          fill={i === frameIdx ? '#f5efe2' : '#3b82f6'}
          stroke="#0a0d16"
          strokeWidth="1"
          style={onSelect ? { cursor: 'pointer' } : undefined}
          onClick={onSelect ? () => onSelect(i) : undefined}
        />
      ))}
    </svg>
  );
}

/* ---------------- Epoch explorer table ---------------- */

function EpochExplorer({
  manifest,
  frameIdx,
  onSelect,
}: {
  manifest: Manifest;
  frameIdx: number;
  onSelect: (idx: number) => void;
}) {
  const [detector, setDetector] = useState('all');
  const detectors = Array.from(new Set(manifest.frames.map((f) => f.detector)));
  const rows = manifest.frames
    .map((f, i) => ({ frame: f, i }))
    .filter((r) => detector === 'all' || r.frame.detector === detector);

  return (
    <div className="mt-8 bg-[#0a0d16] rounded-2xl border border-[#f5efe2]/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-mono uppercase tracking-wider text-emerald-300">Epoch Explorer</h3>
          <p className="text-[11px] text-[#f5efe2]/55 mt-0.5">
            {manifest.frames.length} frames shown · the archive holds {manifest.n_epochs_total} epochs on
            this field · {dateSpan(manifest)}
          </p>
        </div>
        <label className="text-[11px] font-mono text-[#f5efe2]/60 flex items-center gap-2">
          DETECTOR
          <select
            value={detector}
            onChange={(e) => setDetector(e.target.value)}
            className="bg-[#161c2d] border border-[#f5efe2]/20 rounded-lg px-2 py-1.5 text-xs text-[#f5efe2] focus:outline-none focus:border-[#3b82f6]"
          >
            <option value="all">All detectors</option>
            {detectors.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px] font-mono">
          <thead>
            <tr className="text-[#f5efe2]/45 border-b border-[#f5efe2]/10">
              <th className="py-2 pr-3 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">OBSERVED (UTC)</th>
              <th className="py-2 pr-3 font-medium">DETECTOR</th>
              <th className="py-2 pr-3 font-medium">BAND (µm)</th>
              <th className="py-2 font-medium">OBSERVATION ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ frame: f, i }) => (
              <tr
                key={f.index}
                onClick={() => onSelect(i)}
                className={`border-b border-[#f5efe2]/5 cursor-pointer transition-colors ${
                  i === frameIdx
                    ? 'bg-[#3b82f6]/15 text-[#f5efe2]'
                    : 'text-[#f5efe2]/70 hover:bg-[#f5efe2]/5'
                }`}
              >
                <td className="py-1.5 pr-3">{f.index}</td>
                <td className="py-1.5 pr-3">{fmtUtc(f.utc)}</td>
                <td className="py-1.5 pr-3">{f.detector}</td>
                <td className="py-1.5 pr-3">
                  {f.band_um[0].toFixed(2)}–{f.band_um[1].toFixed(2)}
                </td>
                <td className="py-1.5">{f.obs_id}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-[#f5efe2]/50">
                  No frames from this detector in the pack.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#f5efe2]/45 mt-3">Click any row to jump the viewer to that frame.</p>
    </div>
  );
}

/* ---------------- Compare mode ---------------- */

function CompareColumn({
  target,
  pack,
  idx,
}: {
  target: RealTarget;
  pack: PackData | null;
  idx: number;
}) {
  const frame = pack?.manifest.frames[Math.min(idx, (pack?.manifest.frames.length ?? 1) - 1)];
  const change = pack ? brightnessChange(pack.stats) : 0;
  return (
    <div className="bg-[#0a0d16] rounded-2xl border border-[#f5efe2]/10 p-4 flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h4 className="text-base font-medium text-[#f5efe2] truncate">{target.name}</h4>
        <span className="text-[10px] font-mono text-emerald-300 uppercase tracking-wider shrink-0">
          {target.category}
        </span>
      </div>
      <div className="relative aspect-square bg-[#030408] rounded-xl overflow-hidden border border-[#f5efe2]/15 flex items-center justify-center">
        {pack && frame ? (
          <img
            src={`${pack.base}/${frame.file}`}
            alt={`SPHEREx frame of ${target.name}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <p className="text-xs font-mono text-[#f5efe2]/50">Loading…</p>
        )}
      </div>
      {pack && (
        <>
          <div className="mt-3">
            <BrightnessChart stats={pack.stats} frameIdx={Math.min(idx, pack.stats.length - 1)} height={56} />
          </div>
          <dl className="text-[11px] font-mono text-[#f5efe2]/70 space-y-1.5 mt-2">
            <div className="flex justify-between gap-2">
              <dt className="text-[#f5efe2]/45">ARCHIVE EPOCHS</dt>
              <dd>{pack.manifest.n_epochs_total}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[#f5efe2]/45">PACK SPAN</dt>
              <dd>{dateSpan(pack.manifest)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[#f5efe2]/45">BRIGHTNESS 1ST→LAST</dt>
              <dd>
                {change >= 0 ? '+' : ''}
                {change.toFixed(1)}%
              </dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}

function ComparePanel({ slugA }: { slugA: string }) {
  const targetA = REAL_TARGETS.find((t) => t.slug === slugA) ?? REAL_TARGETS[0];
  const [slugB, setSlugB] = useState<string>(
    REAL_TARGETS.find((t) => t.slug !== slugA)?.slug ?? 'barnards-star',
  );
  const effectiveSlugB =
    slugB === slugA ? REAL_TARGETS.find((t) => t.slug !== slugA)?.slug ?? slugB : slugB;
  const targetB = REAL_TARGETS.find((t) => t.slug === effectiveSlugB) ?? REAL_TARGETS[1];
  const [packA, setPackA] = useState<PackData | null>(null);
  const [packB, setPackB] = useState<PackData | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPack(targetA.slug)
      .then((p) => {
        if (!cancelled) setPackA(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [targetA.slug]);

  useEffect(() => {
    let cancelled = false;
    getPack(targetB.slug)
      .then((p) => {
        if (!cancelled) setPackB(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [targetB.slug]);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 px-1">
        <div>
          <h3 className="text-sm font-mono uppercase tracking-wider text-emerald-300">Compare Targets</h3>
          <p className="text-[11px] text-[#f5efe2]/55 mt-0.5">
            Two fields, same frame number, side by side — frames, brightness curves and archive depth.
          </p>
        </div>
        <label className="text-[11px] font-mono text-[#f5efe2]/60 flex items-center gap-2">
          COMPARE WITH
          <select
            value={effectiveSlugB}
            onChange={(e) => setSlugB(e.target.value)}
            className="bg-[#161c2d] border border-[#f5efe2]/20 rounded-lg px-2 py-1.5 text-xs text-[#f5efe2] focus:outline-none focus:border-[#3b82f6]"
          >
            {REAL_TARGETS.filter((t) => t.slug !== slugA).map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-col md:flex-row gap-4">
        <CompareColumn target={targetA} pack={packA} idx={idx} />
        <CompareColumn target={targetB} pack={packB} idx={idx} />
      </div>
      <div className="flex items-center gap-3 mt-3 px-1">
        <span className="text-[11px] font-mono text-[#f5efe2]/60 shrink-0">FRAME {idx + 1} / 12</span>
        <input
          type="range"
          min="0"
          max="11"
          step="1"
          value={idx}
          onChange={(e) => setIdx(parseInt(e.target.value, 10))}
          className="w-full accent-[#3b82f6] cursor-pointer"
        />
      </div>
    </div>
  );
}

/* ---------------- Main explorer ---------------- */

interface RealDataExplorerProps {
  /** Slug chosen elsewhere on the page (e.g. a star card); viewer follows it. */
  requestedSlug?: string;
}

export function RealDataExplorer({ requestedSlug }: RealDataExplorerProps) {
  const [target, setTarget] = useState<RealTarget>(REAL_TARGETS[0]);
  const [pack, setPack] = useState<PackData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [frameIdx, setFrameIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.9); // seconds per frame
  const [viewMode, setViewMode] = useState<'frame' | 'diff'>('frame');
  const timerRef = useRef<number | null>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Follow selections made elsewhere on the page (star cards)
  useEffect(() => {
    if (!requestedSlug) return;
    const t = REAL_TARGETS.find((x) => x.slug === requestedSlug);
    if (t) setTarget(t);
  }, [requestedSlug]);

  // Load + measure the selected target's data pack
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setIsPlaying(false);
    setFrameIdx(0);
    getPack(target.slug)
      .then((p) => {
        if (cancelled) return;
        setPack(p);
        setStatus('ready');
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
    if (!isPlaying || !pack) return;
    timerRef.current = window.setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % pack.manifest.frames.length);
    }, Math.max(150, speed * 1000));
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isPlaying, pack, speed]);

  // Difference view: |frame − frame 1|, amplified so change is visible
  useEffect(() => {
    if (viewMode !== 'diff' || !pack) return;
    const canvas = diffCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const current = pack.gray[frameIdx];
    const first = pack.gray[0];
    const out = ctx.createImageData(GRAY_SIZE, GRAY_SIZE);
    for (let j = 0; j < current.length; j++) {
      const v = Math.min(255, Math.abs(current[j] - first[j]) * 3);
      const o = j * 4;
      out.data[o] = v;
      out.data[o + 1] = v;
      out.data[o + 2] = Math.min(255, v + 36);
      out.data[o + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }, [viewMode, pack, frameIdx]);

  const manifest = pack?.manifest ?? null;
  const frame = manifest?.frames[frameIdx];
  const change = pack ? brightnessChange(pack.stats) : 0;

  const selectFrame = (idx: number) => {
    setFrameIdx(idx);
    setIsPlaying(false);
  };

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
            project backend and stored in this repository. Pick a target, play the sky changing —
            then measure it, difference it, and compare it below.
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
          <div className="lg:col-span-2">
            <div className="flex items-center gap-1.5 bg-[#0a0d16] p-1.5 rounded-xl border border-[#f5efe2]/15 mb-3 self-start w-fit">
              <button
                type="button"
                onClick={() => setViewMode('frame')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase transition-all ${
                  viewMode === 'frame'
                    ? 'bg-[#3b82f6] text-white shadow-md'
                    : 'text-[#f5efe2]/60 hover:text-[#f5efe2]'
                }`}
              >
                Frame
              </button>
              <button
                type="button"
                onClick={() => setViewMode('diff')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase transition-all ${
                  viewMode === 'diff'
                    ? 'bg-[#ef4444] text-white shadow-md'
                    : 'text-[#f5efe2]/60 hover:text-[#f5efe2]'
                }`}
                title="Difference against frame 1 — only what changed stays visible"
              >
                Δ Difference
              </button>
            </div>

            <div className="relative aspect-square max-h-[560px] w-full bg-[#030408] rounded-2xl overflow-hidden border border-[#f5efe2]/20 shadow-inner flex items-center justify-center">
              {status === 'ready' && frame && viewMode === 'frame' && pack && (
                <img
                  src={`${pack.base}/${frame.file}`}
                  alt={`SPHEREx frame ${frame.index} of ${target.name}, observed ${frame.utc} UTC`}
                  className="w-full h-full object-contain"
                />
              )}
              {status === 'ready' && viewMode === 'diff' && (
                <canvas
                  ref={diffCanvasRef}
                  width={GRAY_SIZE}
                  height={GRAY_SIZE}
                  className="w-full h-full object-contain"
                  aria-label={`Difference between frame ${frameIdx + 1} and frame 1 of ${target.name}`}
                />
              )}
              {status === 'loading' && (
                <p className="text-sm font-mono text-[#f5efe2]/60">
                  Loading and measuring real SPHEREx frames…
                </p>
              )}
              {status === 'error' && (
                <p className="text-sm font-mono text-red-300 px-6 text-center">
                  Could not load the data pack for {target.name}. Check your connection and try again.
                </p>
              )}
              {status === 'ready' && manifest && (
                <div className="absolute bottom-3 right-3 bg-[#0a0d16]/80 backdrop-blur-md px-3 py-1 rounded-lg border border-[#f5efe2]/15 text-[11px] font-mono text-[#f5efe2]/80">
                  {viewMode === 'diff'
                    ? `Δ frame ${frameIdx + 1} − frame 1`
                    : `Frame ${frameIdx + 1} of ${manifest.frames.length}`}
                </div>
              )}
            </div>
            {viewMode === 'diff' && status === 'ready' && (
              <p className="text-[11px] text-[#f5efe2]/55 mt-2 leading-relaxed">
                Difference view: each frame is subtracted from frame 1 and amplified ×3. Stars that
                stayed put vanish; anything that moved or changed brightness remains — watch the comet
                leave a trail of change across the morning.
              </p>
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
                  <dd>{fmtUtc(frame.utc)}</dd>
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
                      onClick={() => selectFrame(idx)}
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

            {pack && (
              <div className="border-t border-[#f5efe2]/10 pt-3">
                <div className="flex justify-between text-[11px] font-mono text-[#f5efe2]/60 mb-1">
                  <span>FRAME BRIGHTNESS — MEASURED</span>
                  <span>
                    1st→last {change >= 0 ? '+' : ''}
                    {change.toFixed(1)}%
                  </span>
                </div>
                <BrightnessChart stats={pack.stats} frameIdx={frameIdx} onSelect={selectFrame} />
                <p className="text-[11px] text-[#f5efe2]/45 leading-relaxed">
                  Mean pixel value of each real frame, measured in your browser. Click a point to jump
                  to that frame.
                </p>
              </div>
            )}

            <p className="text-[11px] text-[#f5efe2]/45 leading-relaxed border-t border-[#f5efe2]/10 pt-3">
              Frames: NASA/IPAC Infrared Science Archive (IRSA), SPHEREx level-2 data, retrieved and
              rendered by the backend in this repo (<span className="font-mono">backend/</span>).
            </p>
          </div>
        </div>

        {/* Depth: epoch explorer + compare */}
        {manifest && (
          <EpochExplorer
            manifest={manifest}
            frameIdx={frameIdx}
            onSelect={selectFrame}
          />
        )}
        <ComparePanel slugA={target.slug} />
      </div>
    </div>
  );
}
