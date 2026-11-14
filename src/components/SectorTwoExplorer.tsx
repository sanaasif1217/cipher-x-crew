/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cycleStarIndex,
  REAL_STAR_CATALOG,
  type ExploreCardEntry,
  type RealStarId,
} from '../data/starExploreCatalog';
import { StarCarouselEngine } from '../three/StarCarouselEngine';

interface SectorTwoExplorerProps {
  selectedStarId: RealStarId | 'custom';
  onSelectStar: (card: ExploreCardEntry) => void;
}

const STAR_IDS_ORDER: RealStarId[] = REAL_STAR_CATALOG.map((star) => star.id);

export function SectorTwoExplorer({ selectedStarId, onSelectStar }: SectorTwoExplorerProps) {
  const initialIndex =
    selectedStarId === 'custom'
      ? 0
      : Math.max(
          0,
          REAL_STAR_CATALOG.findIndex((s) => s.id === selectedStarId),
        );

  const [activeIndex, setActiveIndex] = useState<number>(initialIndex);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<StarCarouselEngine | null>(null);
  const activeIndexRef = useRef<number>(activeIndex);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // Mount Three.js 3D Star Engine once inside isolated canvas container
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const startId = STAR_IDS_ORDER[activeIndexRef.current] ?? 'barnards-star';
    const engine = new StarCarouselEngine(mount, startId, STAR_IDS_ORDER);
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const stepStar = useCallback((delta: -1 | 1) => {
    const next = cycleStarIndex(activeIndexRef.current, delta, REAL_STAR_CATALOG.length);
    activeIndexRef.current = next;
    setActiveIndex(next);
    engineRef.current?.setTargetIndex(next, delta);
  }, []);

  const jumpToStar = useCallback((targetIdx: number) => {
    const prev = activeIndexRef.current;
    if (targetIdx === prev || targetIdx < 0 || targetIdx >= REAL_STAR_CATALOG.length) {
      return;
    }
    const direction: -1 | 1 = targetIdx > prev ? 1 : -1;
    activeIndexRef.current = targetIdx;
    setActiveIndex(targetIdx);
    engineRef.current?.setTargetIndex(targetIdx, direction);
  }, []);

  // Sync if user changes active star from Section 1 or Hero search
  useEffect(() => {
    if (selectedStarId === 'custom') return;
    const idx = REAL_STAR_CATALOG.findIndex((s) => s.id === selectedStarId);
    if (idx >= 0 && idx !== activeIndexRef.current) {
      jumpToStar(idx);
    }
  }, [selectedStarId, jumpToStar]);

  const activeStar = REAL_STAR_CATALOG[activeIndex] ?? REAL_STAR_CATALOG[0];
  const prevStar =
    REAL_STAR_CATALOG[cycleStarIndex(activeIndex, -1, REAL_STAR_CATALOG.length)] ?? REAL_STAR_CATALOG[0];
  const nextStar =
    REAL_STAR_CATALOG[cycleStarIndex(activeIndex, 1, REAL_STAR_CATALOG.length)] ?? REAL_STAR_CATALOG[0];

  return (
    <div
      className="explore3d-shell"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          stepStar(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          stepStar(-1);
        }
      }}
    >
      {/* Header preserving exact Section 1 typography sizes (.dest-kicker, .s1-title, .s1-lead) */}
      <header className="explore3d-header">
        <p className="dest-kicker">Sector 02 · SPHEREx Target Atlas</p>
        <h2 id="explore-heading" className="s1-title explore3d-title">
          Explore the stars
        </h2>
        <p className="s1-lead explore3d-subtitle">
          Orbit one 3D star at a time, browse with the side arrows, and launch SPHEREx imaging with Try this star.
        </p>
      </header>

      {/* Main 3D Carousel Stage Row: Left Arrow | Center 3D Star + Beside Detail | Right Arrow */}
      <div className="explore3d-stage-row">
        <button
          type="button"
          className="explore3d-arrow explore3d-arrow--prev"
          aria-label={`Previous star: ${prevStar.name}`}
          onClick={() => stepStar(-1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>

        <div className="explore3d-center-grid">
          {/* Interactive Hyper-Realistic 3D Star Stage */}
          <div className="explore3d-viewport">
            <div
              ref={canvasMountRef}
              className="explore3d-canvas-host"
              role="img"
              aria-label={`Interactive 3D visual of ${activeStar.name}`}
            />

            <div className="explore3d-viewport-meta">
              <span className="explore3d-counter">
                {String(activeIndex + 1).padStart(2, '0')} / {String(REAL_STAR_CATALOG.length).padStart(2, '0')}
              </span>

              <div className="explore3d-dots" role="tablist" aria-label="Choose a showcase star">
                {REAL_STAR_CATALOG.map((star, idx) => (
                  <button
                    key={star.id}
                    type="button"
                    role="tab"
                    aria-selected={idx === activeIndex}
                    aria-label={star.name}
                    title={star.name}
                    className={`explore3d-dot${idx === activeIndex ? ' is-active' : ''}`}
                    onClick={() => jumpToStar(idx)}
                  />
                ))}
              </div>

              <span className="explore3d-drag-hint">Drag to rotate in 3D</span>
            </div>
          </div>

          {/* Concise Target Details Beside the 3D Star */}
          <aside className="explore3d-detail-card" aria-live="polite">
            <div className="explore3d-detail-head">
              <p className="explore3d-detail-kicker">
                {activeStar.coordinates.constellation} · {activeStar.coordinates.distance}
              </p>
              <span className="explore3d-detail-type">{activeStar.spectralType}</span>
            </div>

            <h3 className="explore3d-detail-title">{activeStar.name}</h3>
            <p className="explore3d-detail-desc">{activeStar.description}</p>
            <p className="explore3d-detail-about">{activeStar.howItChanges}</p>

            <dl className="explore3d-facts">
              <div>
                <dt>Right Ascension</dt>
                <dd>{activeStar.coordinates.ra}</dd>
              </div>
              <div>
                <dt>Declination</dt>
                <dd>{activeStar.coordinates.dec}</dd>
              </div>
              <div>
                <dt>{activeStar.signalLabel}</dt>
                <dd>{activeStar.signalValue}</dd>
              </div>
            </dl>

            <div className="explore3d-actions">
              <button
                type="button"
                className="explore3d-try-btn"
                onClick={() => onSelectStar(activeStar)}
              >
                <span>Try this star</span>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 10h12m-4.5-4.5L16 10l-4.5 4.5" />
                </svg>
              </button>

              <div className="explore3d-mobile-arrows">
                <button
                  type="button"
                  className="explore3d-mini-arrow"
                  aria-label={`Previous star: ${prevStar.name}`}
                  onClick={() => stepStar(-1)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="explore3d-mini-arrow"
                  aria-label={`Next star: ${nextStar.name}`}
                  onClick={() => stepStar(1)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </aside>
        </div>

        <button
          type="button"
          className="explore3d-arrow explore3d-arrow--next"
          aria-label={`Next star: ${nextStar.name}`}
          onClick={() => stepStar(1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
