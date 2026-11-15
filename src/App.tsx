/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CosmosEngine } from './cosmos/CosmosEngine';
import { createAudioStore, type AudioStoreApi } from './cosmos/audioEngine';
import {
  isRealStarCard,
  matchKnownStarByQuery,
  pickRandomStar,
  type ExploreCardEntry,
  type RealStarId,
} from './data/starExploreCatalog';
import {
  SectionOneWorkbench,
  type CustomSkyPatch,
} from './components/SectionOneWorkbench';
import { SectorTwoExplorer } from './components/SectorTwoExplorer';
import { RealDataExplorer } from './components/RealDataExplorer';
import { SiteTour } from './components/SiteTour';

gsap.registerPlugin(ScrollTrigger);

type SectionId = 'top' | 'work' | 'sector-02' | 'real-data' | 'contact';

/** Maps the workbench's star ids to Real Frames data-pack slugs. */
const REAL_PACK_SLUGS: Partial<Record<RealStarId | 'custom', string>> = {
  'barnards-star': 'barnards-star',
  'epsilon-indi-b': 'epsilon-indi',
  'wise-0855': 'wise-0855',
  'rw-aurigae': 'rw-aurigae',
  'r-draconis': 'r-draconis',
};



export default function App() {
  const cosmosRef = useRef<HTMLDivElement | null>(null);
  const vignetteRef = useRef<HTMLDivElement | null>(null);
  const journeyRef = useRef<HTMLElement | null>(null);
  const engineRef = useRef<CosmosEngine | null>(null);
  const audioStoreRef = useRef<(() => AudioStoreApi) | null>(null);
  const scrollAnimRef = useRef<gsap.core.Tween | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [soundPressed, setSoundPressed] = useState(false);
  const [activeNav, setActiveNav] = useState<SectionId>('top');
  const [skyQuery, setSkyQuery] = useState('');
  const [selectedStarId, setSelectedStarId] = useState<RealStarId | 'custom'>('barnards-star');
  const [customPatch, setCustomPatch] = useState<CustomSkyPatch | null>(null);
  const [selectionNonce, setSelectionNonce] = useState(0);

  const scrollToSection = (sectionId: SectionId, warpStrength = 0.42) => {
    const targetEl = document.getElementById(sectionId);
    if (!targetEl) return;

    const targetY =
      sectionId === 'top'
        ? 0
        : Math.max(0, targetEl.getBoundingClientRect().top + window.scrollY);
    const distance = Math.abs(targetY - window.scrollY);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || distance < 24) {
      window.scrollTo({ top: targetY, behavior: 'auto' });
      return;
    }

    engineRef.current?.triggerWarpJump(warpStrength);
    scrollAnimRef.current?.kill();

    const scrollProxy = { y: window.scrollY };
    scrollAnimRef.current = gsap.to(scrollProxy, {
      y: targetY,
      duration: Math.min(1.35, Math.max(0.65, distance / 2400)),
      ease: 'power2.inOut',
      onUpdate: () => {
        window.scrollTo(0, scrollProxy.y);
      },
      onComplete: () => {
        scrollAnimRef.current = null;
      },
    });
  };

  const handleSkySearch = (e: FormEvent) => {
    e.preventDefault();
    const matched = matchKnownStarByQuery(skyQuery);
    if (matched) {
      setSelectedStarId(matched);
      setCustomPatch(null);
      setSelectionNonce((n) => n + 1);
    }
    scrollToSection('work', 0.65);
  };

  const handleSelectStar = (card: ExploreCardEntry) => {
    const target = isRealStarCard(card)
      ? card
      : pickRandomStar(selectedStarId === 'custom' ? undefined : selectedStarId);

    setSelectedStarId(target.id);
    setCustomPatch(null);
    setSelectionNonce((n) => n + 1);
    setSkyQuery(target.query);
    scrollToSection('work', 0.65);
  };

  useEffect(() => {
    const container = cosmosRef.current;
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const instantIntro = params.get('autostart') === '1';

    const audioStore = createAudioStore();
    audioStoreRef.current = audioStore;
    audioStore().initAudio();

    let introShown = false;
    const cosmos = new CosmosEngine(
      container,
      () => setLoaded(true),
      () => {
        if (!introShown) {
          introShown = true;
          setIntroDone(true);
        }
      },
      {
        audioStore,
        instantIntro,
        onVignetteChange: (strength) => {
          if (vignetteRef.current) {
            vignetteRef.current.style.setProperty('--vig-alpha', strength.toFixed(3));
          }
        },
      },
    );
    engineRef.current = cosmos;

    return () => {
      scrollAnimRef.current?.kill();
      scrollAnimRef.current = null;
      cosmos.dispose();
      engineRef.current = null;
      audioStore().dispose();
      audioStoreRef.current = null;
    };
  }, []);

  useEffect(() => {
    const journeyEl = journeyRef.current;
    if (!journeyEl) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ctx = gsap.context(() => {
      // Master ScrollTrigger driving 3D camera forward through the galaxy corridor
      ScrollTrigger.create({
        trigger: journeyEl,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          const p = self.progress;
          engineRef.current?.setScrollProgress(p);

          if (p < 0.16) setActiveNav('top');
          else if (p < 0.4) setActiveNav('work');
          else if (p < 0.62) setActiveNav('sector-02');
          else if (p < 0.84) setActiveNav('real-data');
          else setActiveNav('contact');
        },
      });

      // Dust-fade reveals for each landmark destination panel as the camera approaches
      const panels = gsap.utils.toArray<HTMLElement>('[data-destination-panel]');
      panels.forEach((panel) => {
        if (reducedMotion) {
          gsap.fromTo(
            panel,
            { opacity: 0.25 },
            {
              opacity: 1,
              ease: 'none',
              scrollTrigger: {
                trigger: panel,
                start: 'top 90%',
                end: 'top 50%',
                scrub: true,
              },
            },
          );
        } else {
          gsap.fromTo(
            panel,
            { opacity: 0, y: 42, scale: 0.96 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: panel,
                start: 'top 86%',
                end: 'top 38%',
                scrub: 0.55,
              },
            },
          );
        }
      });
    }, journeyRef);

    ScrollTrigger.refresh();

    return () => {
      ctx.revert();
    };
  }, []);

  const handleToggleSound = () => {
    const store = audioStoreRef.current;
    if (!store) return;
    const s = store();
    if (!s.isInitialized) return;
    const muted = s.toggleMute();
    setSoundPressed(!muted);
  };

  const navigateToSection = (sectionId: SectionId) => (e: React.MouseEvent) => {
    e.preventDefault();
    scrollToSection(sectionId, 0.42);
  };

  return (
    <>
      <div id="cosmos-stage" ref={cosmosRef} data-testid="cosmos-canvas" aria-hidden="true">
        <div className="js-canvas-container" />
        <div className="cosmos-vignette" ref={vignetteRef} />
      </div>

      {/* Fixed Observatory Chrome above 3D Starfield */}
      <div className={`ui-chrome${introDone ? ' on' : ''}`} id="ui">
        <header className="sky-header">
          <a
            className="logo"
            href="#top"
            aria-label="Cipher-X Crew — back to top"
            onClick={navigateToSection('top')}
            style={{
              fontFamily: 'Antonio, sans-serif',
              fontSize: '20px',
              letterSpacing: '0.14em',
              color: '#f5efe2',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              height: '58px',
            }}
          >
            <span style={{ color: '#34d399' }}>✦</span> CIPHER-X CREW
          </a>
          <nav className="sky-nav" aria-label="Main">
            <a
              href="#top"
              className={activeNav === 'top' ? 'is-active' : undefined}
              onClick={navigateToSection('top')}
            >
              Home
            </a>
            <a
              href="#work"
              className={activeNav === 'work' ? 'is-active' : undefined}
              onClick={navigateToSection('work')}
            >
              Try Demo
            </a>
            <a
              href="#sector-02"
              className={activeNav === 'sector-02' ? 'is-active' : undefined}
              onClick={navigateToSection('sector-02')}
            >
              Explore
            </a>
            <a
              href="#real-data"
              className={activeNav === 'real-data' ? 'is-active' : undefined}
              onClick={navigateToSection('real-data')}
            >
              Real Data
            </a>
            <a
              href="#contact"
              className={activeNav === 'contact' ? 'is-active' : undefined}
              onClick={navigateToSection('contact')}
            >
              Our Team
            </a>
            <a className="pill" href="#work" onClick={navigateToSection('work')}>
              Try Demo
            </a>
          </nav>
        </header>

        <div className="corner">
          <span>Scroll to explore</span>
          <i />
          <button
            type="button"
            className="sound"
            id="sound"
            aria-pressed={soundPressed}
            aria-label="Ambient sound"
            onClick={handleToggleSound}
          >
            <svg viewBox="0 0 24 24">
              <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5Z" />
              <path className="w" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
              <path className="x" d="m16 10 4 4m0-4-4 4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scroll-Driven Cosmic Corridor & Destination Landmarks */}
      <main
        ref={journeyRef}
        className={`scroll-journey${introDone ? ' on' : ''}`}
        data-testid="scroll-journey"
      >
        <section id="top" className="hero-stage">
          <div className="hero-card">
            <div className="hero-badge">✦ SPHEREx Mission Observatory</div>
            <h1>Watch the sky change</h1>
            <p className="cap">
              Making it easy for anyone to quickly see how they change over time.
            </p>
            <form onSubmit={handleSkySearch} className="sky-search-form">
              <input
                type="text"
                value={skyQuery}
                onChange={(e) => setSkyQuery(e.target.value)}
                placeholder="Enter a star name, like WISE 0855 · Barnard's Star"
                className="sky-search-input"
              />
              <button type="submit" className="sky-search-btn">
                Explore Motion
              </button>
            </form>
            <a
              className="go"
              href="#work"
              id="go"
              aria-label="Open sky observatory"
              onClick={navigateToSection('work')}
              onPointerEnter={() => engineRef.current?.startHoverTransition()}
              onPointerLeave={() => engineRef.current?.stopHoverTransition()}
            >
              <svg viewBox="0 0 24 24">
                <path d="M4 12h16M14 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        </section>

        {/* Section 01: Interactive Sky Motion & Coordinate Observatory */}
        <section
          id="work"
          className="destination destination--center destination--workbench"
          aria-labelledby="work-heading"
          data-destination="work"
        >
          <div className="destination-panel s1-outer-panel" data-destination-panel>
            <SectionOneWorkbench
              selectedStarId={selectedStarId}
              customPatch={customPatch}
              selectionNonce={selectionNonce}
              onSelectStar={(starId) => {
                setSelectedStarId(starId);
                setCustomPatch(null);
                setSelectionNonce((n) => n + 1);
              }}
              onApplyCustomCoords={(patch, matchedId) => {
                if (matchedId) {
                  setSelectedStarId(matchedId);
                  setCustomPatch(null);
                } else {
                  setSelectedStarId('custom');
                  setCustomPatch(patch);
                }
                setSelectionNonce((n) => n + 1);
              }}
            />
          </div>
        </section>

        {/* Destination 02: Explore the stars (Interactive Sky Atlas & Observatory Gallery) */}
        <section
          id="sector-02"
          className="destination destination--center destination--explore"
          aria-labelledby="explore-heading"
          data-destination="about"
        >
          <div className="destination-panel explore-panel" data-destination-panel>
            <SectorTwoExplorer
              selectedStarId={selectedStarId}
              onSelectStar={handleSelectStar}
            />
          </div>
        </section>



        {/* Destination 03: Real SPHEREx frames from the IRSA archive (backend data packs) */}
        <section
          id="real-data"
          className="destination destination--center"
          aria-label="Real SPHEREx data"
          data-destination="real-data"
        >
          <div data-destination-panel>
            <RealDataExplorer requestedSlug={REAL_PACK_SLUGS[selectedStarId]} />
          </div>
        </section>

        {/* Destination 04: Cipher-X Crew Team Landmark (Centered) */}
        <section
          id="contact"
          className="destination destination--center destination--team"
          aria-labelledby="contact-heading"
          data-destination="contact"
        >
          <div className="destination-panel destination-panel--team" data-destination-panel>
            <div className="team-header">
              <div className="team-badge">✦ International Coalition · Pakistan & India</div>
              <h2 id="contact-heading" className="team-title">
                Team — Cipher-X Crew
              </h2>
              <p className="team-subtitle">
                Six members, two countries — Pakistan and India.
              </p>
            </div>
            <div className="team-grid">
              <article className="team-card team-card--lead">
                <span className="team-role team-role--lead">✦ Team Leader</span>
                <h3 className="team-name">Sana Asif</h3>
              </article>
              <article className="team-card">
                <span className="team-role">Team Member</span>
                <h3 className="team-name">Sherdil Khan</h3>
              </article>
              <article className="team-card">
                <span className="team-role">Team Member</span>
                <h3 className="team-name">Naheed Nawaz</h3>
              </article>
              <article className="team-card">
                <span className="team-role">Team Member</span>
                <h3 className="team-name">Abdul Qadoos</h3>
              </article>
              <article className="team-card">
                <span className="team-role">Team Member</span>
                <h3 className="team-name">Abdullah</h3>
              </article>
              <article className="team-card">
                <span className="team-role">Team Member</span>
                <h3 className="team-name">Sujal Khanolkar</h3>
              </article>
            </div>
          </div>
        </section>
      </main>

      <div className={`loader${loaded ? ' gone' : ''}`} id="loader" aria-hidden="true">
        <span />
      </div>

      <SiteTour />
    </>
  );
}
