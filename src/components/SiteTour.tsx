import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * SiteTour — a first-visit guided tour for new visitors.
 *
 * On a first visit (localStorage flag unset) it offers a short tour.
 * The tour walks through the page section by section, scrolling to
 * each one and outlining it while a small card explains what it does.
 * A floating "Site guide" button lets anyone restart the tour later.
 */

interface TourStep {
  targetId: string;
  title: string;
  text: string;
}

const STEPS: TourStep[] = [
  {
    targetId: 'top',
    title: 'Welcome to Watch the Sky Change',
    text: 'This site shows how one patch of the sky changes over time — using real images from NASA\u2019s SPHEREx telescope. The tour takes about a minute.',
  },
  {
    targetId: 'work',
    title: '1 · Start with a star',
    text: 'Pick any of the five benchmark stars — or the interstellar comet 3I/ATLAS — and see how SPHEREx has observed it: how many images exist, and how it moves.',
  },
  {
    targetId: 'real-data',
    title: '2 · Watch real frames change',
    text: 'This is the actual archive data: 12 real SPHEREx frames for the selected target. Press Play and watch the sky change; every frame shows its real time, detector and wavelength band.',
  },
  {
    targetId: 'real-data',
    title: '3 · Difference view & field of view',
    text: 'Switch to \u0394 Difference and the fixed stars vanish — only what moved remains, which is how movers like the comet stand out. The field-of-view buttons zoom into the centre of the field, and the green Measured Result card shows the comet\u2019s motion, fitted from these very frames.',
  },
  {
    targetId: 'research-assistant',
    title: '4 · Ask the project',
    text: 'Questions about the data or the method? The Research Assistant answers from the project\u2019s own documents and cites its source. That\u2019s the tour — enjoy exploring!',
  },
];

const STORAGE_KEY = 'wtsc-tour-done';

export function SiteTour() {
  const [mode, setMode] = useState<'hidden' | 'prompt' | 'touring'>('hidden');
  const [step, setStep] = useState(0);
  const highlightedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      seen = false;
    }
    if (!seen) {
      const t = window.setTimeout(() => setMode('prompt'), 1400);
      return () => window.clearTimeout(t);
    }
  }, []);

  const clearHighlight = useCallback(() => {
    const el = highlightedRef.current;
    if (el) {
      el.style.outline = '';
      el.style.outlineOffset = '';
      highlightedRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (mode !== 'touring') return;
    const target = document.getElementById(STEPS[step].targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const t = window.setTimeout(() => {
      clearHighlight();
      target.style.outline = '2px solid rgba(52, 211, 153, 0.8)';
      target.style.outlineOffset = '6px';
      highlightedRef.current = target;
    }, 450);
    return () => window.clearTimeout(t);
  }, [mode, step, clearHighlight]);

  const finish = useCallback(() => {
    clearHighlight();
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* private mode — the tour simply offers itself again next visit */
    }
    setMode('hidden');
    setStep(0);
  }, [clearHighlight]);

  const start = () => {
    setStep(0);
    setMode('touring');
  };

  if (mode === 'hidden') {
    return (
      <button
        type="button"
        onClick={start}
        className="fixed bottom-4 right-4 z-[90] px-3.5 py-2 rounded-full bg-[#121622]/90 backdrop-blur border border-emerald-400/40 text-emerald-200 text-xs font-mono shadow-xl hover:bg-[#1a2032] transition-colors"
        aria-label="Start the site guide tour"
      >
        🧭 Site guide
      </button>
    );
  }

  if (mode === 'prompt') {
    return (
      <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-[90] bg-[#121622]/95 backdrop-blur-md border border-emerald-400/30 rounded-2xl p-5 shadow-2xl text-[#f5efe2]">
        <h3 className="text-base font-semibold">New here? 👋</h3>
        <p className="text-sm text-[#f5efe2]/75 mt-1 leading-relaxed">
          Take a one-minute guided tour — we'll walk you through the stars, the real SPHEREx
          frames, and how we measured the comet's motion.
        </p>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={start}
            className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 transition-colors"
          >
            Start the tour
          </button>
          <button
            type="button"
            onClick={finish}
            className="px-4 py-2 rounded-xl bg-[#1a2032] border border-[#f5efe2]/20 text-sm text-[#f5efe2]/80 hover:text-[#f5efe2] transition-colors"
          >
            No thanks
          </button>
        </div>
      </div>
    );
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  return (
    <div
      className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-[90] bg-[#121622]/95 backdrop-blur-md border border-emerald-400/30 rounded-2xl p-5 shadow-2xl text-[#f5efe2]"
      role="dialog"
      aria-label={`Site tour, step ${step + 1} of ${STEPS.length}: ${current.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug">{current.title}</h3>
        <button
          type="button"
          onClick={finish}
          className="text-[#f5efe2]/50 hover:text-[#f5efe2] text-lg leading-none"
          aria-label="End the tour"
        >
          ✕
        </button>
      </div>
      <p className="text-sm text-[#f5efe2]/75 mt-1.5 leading-relaxed">{current.text}</p>
      <div className="flex items-center justify-between mt-4">
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={`w-2 h-2 rounded-full ${i === step ? 'bg-emerald-400' : 'bg-[#f5efe2]/25'}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-3 py-1.5 rounded-lg bg-[#1a2032] border border-[#f5efe2]/20 text-xs text-[#f5efe2]/80 hover:text-[#f5efe2] transition-colors"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? finish() : setStep(step + 1))}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-400 transition-colors"
          >
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
