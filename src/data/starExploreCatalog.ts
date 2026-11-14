/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import barnardImg from '../assets/images/star_barnards_star_1794632947286.jpg';
import epsilonImg from '../assets/images/star_epsilon_indi_b_1794632948278.jpg';
import wiseImg from '../assets/images/star_wise_0855_1794632948773.jpg';
import rwImg from '../assets/images/star_rw_aurigae_1794632948893.jpg';
import rDracImg from '../assets/images/star_r_draconis_1794632949659.jpg';
import surpriseImg from '../assets/images/star_surprise_vista_1794632950410.jpg';
import {
  computeStarObservationReadout,
  cycleStarIndex,
  matchKnownStarByCoords,
  matchKnownStarByQuery,
  parseDecToDegrees,
  parseRaToDegrees,
  pickRandomStarId,
  projectSkyAtlasPoint,
  REAL_STAR_IDS,
  STAR_REFERENCE_COORDS,
  type RealStarId,
  type StarObservationReadout,
  type StarSimulationType,
} from './starObservationMath';

export {
  computeStarObservationReadout,
  cycleStarIndex,
  matchKnownStarByCoords,
  matchKnownStarByQuery,
  parseDecToDegrees,
  parseRaToDegrees,
  pickRandomStarId,
  projectSkyAtlasPoint,
  REAL_STAR_IDS,
  STAR_REFERENCE_COORDS,
  type RealStarId,
  type StarObservationReadout,
  type StarSimulationType,
};

export type ExploreFilterGroup = 'all' | 'motion' | 'binary' | 'variable';

export interface StarCatalogEntry {
  id: RealStarId;
  name: string;
  shortName: string;
  query: string;
  description: string;
  category: string;
  filterGroup: Exclude<ExploreFilterGroup, 'all'>;
  metaLine: string;
  signalLabel: string;
  signalValue: string;
  coordPreview: string;
  imageSrc: string;
  imageAlt: string;
  fallbackGradient: string;
  coordinates: {
    ra: string;
    dec: string;
    distance: string;
    constellation: string;
  };
  spectralType: string;
  tagline: string;
  howItChanges: string;
  spherexNote: string;
  simulationType: StarSimulationType;
  buttonLabel: string;
}

export interface SurpriseCardEntry {
  id: 'surprise-me';
  name: string;
  query: string;
  description: string;
  metaLine: string;
  signalLabel: string;
  signalValue: string;
  coordPreview: string;
  imageSrc: string;
  imageAlt: string;
  fallbackGradient: string;
  buttonLabel: string;
}

export type ExploreCardEntry = StarCatalogEntry | SurpriseCardEntry;

export const REAL_STAR_CATALOG: StarCatalogEntry[] = [
  {
    id: 'barnards-star',
    name: "Barnard's Star",
    shortName: "Barnard's Star",
    query: "Barnard's Star",
    description: 'A nearby star that drifts across the sky',
    category: 'Proper Motion',
    filterGroup: 'motion',
    metaLine: 'M4.0V Red Dwarf · 5.96 LY · Ophiuchus',
    signalLabel: 'Apparent Drift',
    signalValue: '10.36″ / yr',
    coordPreview: '17h 57m 48.5s · +04° 41′ 36″',
    imageSrc: barnardImg,
    imageAlt: "Deep-field telescope view of Barnard's Star glowing warm crimson in Ophiuchus",
    fallbackGradient:
      'radial-gradient(circle at 52% 48%, rgba(255, 190, 140, 0.42), rgba(140, 42, 32, 0.25) 45%, #05070e 90%)',
    coordinates: {
      ra: '17h 57m 48.5s',
      dec: '+04° 41′ 36″',
      distance: '5.96 LY',
      constellation: 'Ophiuchus',
    },
    spectralType: 'M4.0V Red Dwarf',
    tagline: 'Fastest apparent sky drift of any known star from Earth',
    howItChanges:
      'Unlike distant background stars that appear fixed for centuries, Barnard’s Star streaks across the sky at 10.36 arcseconds every year — shifting half a full Moon’s width within a single human lifetime.',
    spherexNote:
      'Repeated SPHEREx all-sky passes stack epoch astrometry against faint infrared background galaxies to measure its exact trajectory.',
    simulationType: 'drift',
    buttonLabel: 'Try this star',
  },
  {
    id: 'epsilon-indi-b',
    name: 'Epsilon Indi B',
    shortName: 'Epsilon Indi B',
    query: 'Epsilon Indi B',
    description: 'A pair of brown dwarfs orbiting a star',
    category: 'Brown Dwarf Binary',
    filterGroup: 'binary',
    metaLine: 'T1V + T6V Pair · 12.0 LY · Indus',
    signalLabel: 'Mutual Orbit',
    signalValue: '15.0 yr period',
    coordPreview: '22h 04m 10.5s · -56° 46′ 58″',
    imageSrc: epsilonImg,
    imageAlt: 'High-resolution infrared telescope view of binary brown dwarfs Epsilon Indi Ba and Bb',
    fallbackGradient:
      'radial-gradient(circle at 42% 46%, rgba(245, 195, 128, 0.35), rgba(90, 62, 110, 0.28) 52%, #04060d 92%)',
    coordinates: {
      ra: '22h 04m 10.5s',
      dec: '-56° 46′ 58″',
      distance: '12.0 LY',
      constellation: 'Indus',
    },
    spectralType: 'T1V + T6V Binary Pair',
    tagline: 'Locked substellar twins waltzing around each other every 15 years',
    howItChanges:
      'Epsilon Indi Ba and Bb swing around a shared barycenter in a 15-year mutual orbit while drifting together alongside their bright host star, visibly swapping sky separation across epochs.',
    spherexNote:
      'SPHEREx infrared spectroscopy separates methane and water-vapor absorption bands across the warmer T1 and cooler T6 atmospheres.',
    simulationType: 'binary',
    buttonLabel: 'Try this star',
  },
  {
    id: 'wise-0855',
    name: 'WISE 0855',
    shortName: 'WISE 0855',
    query: 'WISE 0855 (RA 08h55m10.831s, Dec -7°14′42.53″)',
    description: 'A faint, fast-moving brown dwarf (RA 08h55m10.831s, Dec -7°14′42.53″)',
    category: 'Sub-Brown Dwarf',
    filterGroup: 'motion',
    metaLine: 'Class Y (~240 K) · 7.43 LY · Hydra',
    signalLabel: 'IR Proper Motion',
    signalValue: '8.11″ / yr',
    coordPreview: '08h 55m 10.831s · -07° 14′ 42.53″',
    imageSrc: wiseImg,
    imageAlt: 'Infrared deep-sky view of ultra-cold sub-brown dwarf WISE 0855',
    fallbackGradient:
      'radial-gradient(circle at 50% 50%, rgba(235, 224, 200, 0.32), rgba(75, 55, 88, 0.25) 48%, #04050c 92%)',
    coordinates: {
      ra: '08h 55m 10.831s',
      dec: '-07° 14′ 42.53″',
      distance: '7.43 LY',
      constellation: 'Hydra',
    },
    spectralType: 'Spectral Class Y (~240 K)',
    tagline: 'Faint, icy brown dwarf racing past background stars at 8.11″/yr',
    howItChanges:
      'At roughly −25°C, WISE 0855 emits almost no visible light. In infrared surveys it leaps rapidly across starfields (8.11 arcseconds/yr) while subtle cloud-band shifts alter its thermal glow.',
    spherexNote:
      'SPHEREx’s sensitive near-to-mid infrared detectors track WISE 0855’s parallax wobble and water-ice cloud signatures.',
    simulationType: 'infrared',
    buttonLabel: 'Try this star',
  },
  {
    id: 'rw-aurigae',
    name: 'RW Aurigae',
    shortName: 'RW Aurigae',
    query: 'RW Aurigae',
    description: 'A young variable star that flickers and changes brightness',
    category: 'Variable Binary',
    filterGroup: 'variable',
    metaLine: 'T Tauri Disk · 530 LY · Auriga',
    signalLabel: 'Dust Dip Range',
    signalValue: 'Δ 4.0 mag (40×)',
    coordPreview: '05h 07m 49.5s · +30° 24′ 05″',
    imageSrc: rwImg,
    imageAlt: 'Telescope view of young binary system RW Aurigae wrapped in a dusty tidal stream',
    fallbackGradient:
      'radial-gradient(circle at 50% 50%, rgba(255, 210, 130, 0.42), rgba(145, 85, 35, 0.26) 50%, #05070e 92%)',
    coordinates: {
      ra: '05h 07m 49.5s',
      dec: '+30° 24′ 05″',
      distance: '530 LY',
      constellation: 'Auriga',
    },
    spectralType: 'Classical T Tauri Binary',
    tagline: 'Young star periodically eclipsed by swirling tidal dust bridges',
    howItChanges:
      'Gravitational flybys between RW Aurigae’s young twin stars tear loose dense ribbons of circumstellar gas and dust, dimming the primary star by up to 40× (4 full magnitudes) before it brightens again.',
    spherexNote:
      'Multi-wavelength SPHEREx photometry penetrates dusty occultation plumes to reveal warm silicate dust re-emission as optical light fades.',
    simulationType: 'variable-dip',
    buttonLabel: 'Try this star',
  },
  {
    id: 'r-draconis',
    name: 'R Draconis',
    shortName: 'R Draconis',
    query: 'R Draconis',
    description: 'A variable star that pulses in brightness',
    category: 'Mira Pulsator',
    filterGroup: 'variable',
    metaLine: 'Mira Red Giant · 2,100 LY · Draco',
    signalLabel: 'Pulse Cycle',
    signalValue: '245.6 d · 400×',
    coordPreview: '16h 32m 40.2s · +66° 45′ 18″',
    imageSrc: rDracImg,
    imageAlt: 'Telescope capture of pulsing Mira red giant R Draconis surrounded by expelled dust shells',
    fallbackGradient:
      'radial-gradient(circle at 50% 50%, rgba(255, 165, 110, 0.44), rgba(145, 35, 30, 0.28) 52%, #05060d 92%)',
    coordinates: {
      ra: '16h 32m 40.2s',
      dec: '+66° 45′ 18″',
      distance: '2,100 LY',
      constellation: 'Draco',
    },
    spectralType: 'M3e–M9e III Mira Giant',
    tagline: 'Swelling red giant brightening nearly 400× every 245.6 days',
    howItChanges:
      'Deep thermal instabilities inside R Draconis cause its outer envelope to physically expand and cool, then contract and brighten across a dramatic 6.5-magnitude rhythmic heartbeat.',
    spherexNote:
      'SPHEREx captures shifting molecular bands (CO, H₂O, TiO) as shockwaves ripple through the giant’s expanding outer layers.',
    simulationType: 'pulsation',
    buttonLabel: 'Try this star',
  },
];

export const SURPRISE_CARD: SurpriseCardEntry = {
  id: 'surprise-me',
  name: 'Surprise me',
  query: 'Surprise me',
  description: 'Not sure? We’ll pick one for you',
  metaLine: 'Curated Target · Random Epoch',
  signalLabel: 'Catalog Pool',
  signalValue: '5 Benchmark Stars',
  coordPreview: 'Auto-loads RA / Dec & Time-Lapse',
  imageSrc: surpriseImg,
  imageAlt: 'Panoramic space telescope mosaic of luminous stars, nebulae, and globular clusters',
  fallbackGradient:
    'radial-gradient(circle at 50% 50%, rgba(245, 239, 226, 0.3), rgba(50, 46, 62, 0.22) 55%, #04050c 92%)',
  buttonLabel: 'Surprise me',
};

export const EXPLORE_CARDS: ExploreCardEntry[] = [...REAL_STAR_CATALOG, SURPRISE_CARD];

export function isRealStarCard(entry: ExploreCardEntry): entry is StarCatalogEntry {
  return entry.id !== 'surprise-me';
}

export function pickRandomStar(excludeId?: RealStarId, rng: () => number = Math.random): StarCatalogEntry {
  const chosenId = pickRandomStarId(excludeId, rng);
  return REAL_STAR_CATALOG.find((star) => star.id === chosenId) ?? REAL_STAR_CATALOG[0];
}
