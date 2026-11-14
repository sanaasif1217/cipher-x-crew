/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ValleyEngine } from './valley/ValleyEngine';
import { createAudioStore, type AudioStoreApi } from './valley/audioEngine';
import { RealDataExplorer } from './components/RealDataExplorer';

gsap.registerPlugin(ScrollTrigger);

type SectionId = 'top' | 'work' | 'about' | 'journal' | 'contact';

const PROJECTS = [
  {
    title: 'Stellar Nursery Alpha',
    meta: 'Emission Nebula · Carina Arm · 2,800 LY',
    summary:
      'Active star-forming region condensing primordial molecular hydrogen into luminous stellar clusters.',
  },
  {
    title: 'Exoplanet Kepler-186f',
    meta: 'Habitable Zone · Cygnus · 580 LY',
    summary:
      'Earth-sized rocky world orbiting an active red dwarf in the outer reaches of the Milky Way.',
  },
  {
    title: 'Pulsar PSR B1937+21',
    meta: 'Neutron Star · Vulpecula · 11,000 LY',
    summary:
      'Rapidly rotating magnetized neutron star emitting precise pulsed radio beacons across the galaxy.',
  },
];

const JOURNAL_NOTES = [
  {
    title: 'Mapping Dark Energy Across Galactic Filaments',
    meta: 'Observation Note 04 · 7 min read',
    summary:
      'How gravitational lensing reveals invisible matter bridges connecting distant galaxy clusters.',
  },
  {
    title: 'Spectroscopic Signatures of Extraterrestrial Atmospheres',
    meta: 'Observation Note 03 · 5 min read',
    summary:
      'Detecting water vapor and ozone absorption bands in transiting exoplanet light curves.',
  },
];

interface StarCardItem {
  name: string;
  query: string;
  description: string;
  buttonLabel: string;
}

const STAR_CARDS: StarCardItem[] = [
  {
    name: "Barnard's Star",
    query: "Barnard's Star",
    description: "A nearby star that drifts across the sky",
    buttonLabel: "Try this star",
  },
  {
    name: "Epsilon Indi B",
    query: "Epsilon Indi B",
    description: "A pair of brown dwarfs orbiting a star",
    buttonLabel: "Try this star",
  },
  {
    name: "WISE 0855",
    query: "WISE 0855 (RA 08h55m10.831s, Dec -7°14′42.53″)",
    description: "A faint, fast-moving brown dwarf (RA 08h55m10.831s, Dec -7°14′42.53″)",
    buttonLabel: "Try this star",
  },
  {
    name: "RW Aurigae",
    query: "RW Aurigae",
    description: "A young variable star that flickers and changes brightness",
    buttonLabel: "Try this star",
  },
  {
    name: "R Draconis",
    query: "R Draconis",
    description: "A variable star that pulses in brightness",
    buttonLabel: "Try this star",
  },
  {
    name: "Surprise me",
    query: "Surprise me",
    description: "Not sure? We’ll pick one for you",
    buttonLabel: "Surprise me",
  },
];

/** Star card name -> real data pack slug in backend/static_data/ */
const STAR_SLUG: Record<string, string> = {
  "Barnard's Star": 'barnards-star',
  'Epsilon Indi B': 'epsilon-indi',
  'WISE 0855': 'wise-0855',
  'RW Aurigae': 'rw-aurigae',
  'R Draconis': 'r-draconis',
};

export default function App() {
  const valleyRef = useRef<HTMLDivElement | null>(null);
  const vignetteRef = useRef<HTMLDivElement | null>(null);
  const journeyRef = useRef<HTMLElement | null>(null);
  const engineRef = useRef<ValleyEngine | null>(null);
  const audioStoreRef = useRef<(() => AudioStoreApi) | null>(null);
  const scrollAnimRef = useRef<gsap.core.Tween | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [soundPressed, setSoundPressed] = useState(false);
  const [activeNav, setActiveNav] = useState<SectionId>('top');
  const [skyQuery, setSkyQuery] = useState('');
  const [realSlug, setRealSlug] = useState('3i-atlas');
  const [starLoading, setStarLoading] = useState<string | null>(null);
  const [starError, setStarError] = useState<string | null>(null);

  const handleSkySearch = (e: FormEvent) => {
    e.preventDefault();
    engineRef.current?.triggerWarpJump(0.65);
    const workEl = document.getElementById('sector-02');
    if (workEl) {
      workEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectStar = (card: StarCardItem) => {
    let chosen = card;
    if (card.name === 'Surprise me') {
      const realStars = STAR_CARDS.filter((c) => c.name !== 'Surprise me');
      chosen = realStars[Math.floor(Math.random() * realStars.length)];
    }

    setStarLoading(card.name);
    setStarError(null);

    // Fill search box
    setSkyQuery(chosen.query);

    // Point the real-data viewer at this star's data pack
    const slug = STAR_SLUG[chosen.name];
    if (slug) {
      setRealSlug(slug);
    }

    // Smooth scroll to the real-data viewer
    const viewerEl = document.getElementById('real-data');
    if (viewerEl) {
      viewerEl.scrollIntoView({ behavior: 'smooth' });
    }

    // Trigger warp jump & loading state
    engineRef.current?.triggerWarpJump(0.85);

    setTimeout(() => {
      setStarLoading(null);
    }, 900);
  };

  useEffect(() => {
    const container = valleyRef.current;
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const instantIntro = params.get('autostart') === '1';

    const audioStore = createAudioStore();
    audioStoreRef.current = audioStore;
    audioStore().initAudio();

    let introShown = false;
    const valley = new ValleyEngine(
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
    engineRef.current = valley;

    return () => {
      scrollAnimRef.current?.kill();
      scrollAnimRef.current = null;
      valley.dispose();
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
          else if (p < 0.42) setActiveNav('work');
          else if (p < 0.66) setActiveNav('about');
          else if (p < 0.88) setActiveNav('journal');
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

    engineRef.current?.triggerWarpJump(0.42);
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

  return (
    <>
      <div id="valley" ref={valleyRef} data-testid="valley-canvas" aria-hidden="true">
        <div className="js-canvas-container" />
        <div className="valley-vignette" ref={vignetteRef} />
      </div>

      {/* Fixed Studio Chrome above 3D Starfield */}
      <div className={`ui-chrome${introDone ? ' on' : ''}`} id="ui">
        <header className="fh-header">
          <a
            className="logo"
            href="#top"
            aria-label="NASA"
            onClick={navigateToSection('top')}
          >
            <img
              src="/assets/aistudio/nasa_worm_logo_transparent-removebg-preview_c546c34a.png"
              alt="NASA"
              style={{ height: '58px', width: 'auto', display: 'block', objectFit: 'contain' }}
            />
          </a>
          <nav className="fh-nav" aria-label="Main">
            <a
              href="#sector-02"
              className={activeNav === 'work' ? 'is-active' : undefined}
              onClick={navigateToSection('work')}
            >
              Explore
            </a>
            <a
              href="#about"
              className={activeNav === 'about' ? 'is-active' : undefined}
              onClick={navigateToSection('about')}
            >
              About
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
          <span>Scroll to wander</span>
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
            <div className="hero-badge">✦ SPHEREx Mission Simulator</div>
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
              aria-label="See our work"
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

        {/* Destination 01: Nebula Landmark (Left in 3D space -> Panel aligned Right) */}
        <section
          id="work"
          className="destination destination--right"
          aria-labelledby="work-heading"
          data-destination="work"
        >
          <div className="destination-panel" data-destination-panel>
            <p className="dest-kicker">Sector 01 · Stellar Nursery Nebula</p>
            <h2 id="work-heading" className="dest-title">
              Celestial Observations
            </h2>
            <div className="dest-list">
              {PROJECTS.map((item) => (
                <article key={item.title} className="dest-item">
                  <p className="dest-item-meta">{item.meta}</p>
                  <h3 className="dest-item-title">{item.title}</h3>
                  <p className="dest-item-summary">{item.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Destination 02: Explore the stars (Ringed Planet Landmark) */}
        <section
          id="sector-02"
          className="destination destination--left destination--explore"
          aria-labelledby="explore-heading"
          data-destination="about"
        >
          <div className="destination-panel destination-panel--wide explore-panel" data-destination-panel>
            <p className="dest-kicker">Sector 02 · Ringed Sanctuary</p>
            <h2 id="explore-heading" className="dest-title">
              Explore the stars
            </h2>
            <p className="explore-subtitle">
              Not sure where to look? Pick a star below and watch how it moves or changes in SPHEREx images.
            </p>

            {starError && <div className="explore-error">{starError}</div>}

            <div className="star-cards-grid">
              {STAR_CARDS.map((card) => (
                <article key={card.name} className="star-card">
                  <div className="star-patch">
                    <div className="star-patch-glow" />
                    <div className="star-patch-dot" />
                    <svg className="star-patch-grid" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="20" stroke="rgba(146, 180, 255, 0.2)" fill="none" strokeWidth="0.8" />
                      <circle cx="50" cy="50" r="38" stroke="rgba(146, 180, 255, 0.12)" fill="none" strokeWidth="0.8" />
                      <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(146, 180, 255, 0.1)" strokeWidth="0.8" />
                      <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(146, 180, 255, 0.1)" strokeWidth="0.8" />
                    </svg>
                  </div>
                  <h3 className="star-card-title">{card.name}</h3>
                  <p className="star-card-desc">{card.description}</p>
                  <button
                    type="button"
                    className="star-card-btn"
                    disabled={starLoading === card.name}
                    onClick={() => handleSelectStar(card)}
                  >
                    {starLoading === card.name ? 'Loading SPHEREx...' : card.buttonLabel}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Real SPHEREx data packs — served by the project backend in this repo */}
        <section
          id="real-data"
          aria-label="Real SPHEREx data viewer"
          style={{ position: 'relative', zIndex: 2 }}
        >
          <RealDataExplorer requestedSlug={realSlug} />
        </section>

        {/* Destination 03: Spiral Galaxy Landmark (Left in 3D space -> Panel aligned Right) */}
        <section
          id="journal"
          className="destination destination--right"
          aria-labelledby="journal-heading"
          data-destination="journal"
        >
          <div className="destination-panel" data-destination-panel>
            <p className="dest-kicker">Sector 03 · Grand Spiral</p>
            <h2 id="journal-heading" className="dest-title">
              Observatory Field Notes
            </h2>
            <div className="dest-list">
              {JOURNAL_NOTES.map((note) => (
                <article key={note.title} className="dest-item">
                  <p className="dest-item-meta">{note.meta}</p>
                  <h3 className="dest-item-title">{note.title}</h3>
                  <p className="dest-item-summary">{note.summary}</p>
                </article>
              ))}
            </div>
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
    </>
  );
}
