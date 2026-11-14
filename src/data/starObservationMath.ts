/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  computeBarnardPosition,
  computeEpsilonIndiOrbit,
  computeRDraconisPulsation,
  computeRwAurigaeOccultation,
  computeWise0855Position,
} from '../cosmos/cosmosMath';

export type RealStarId =
  | 'barnards-star'
  | 'epsilon-indi-b'
  | 'wise-0855'
  | 'rw-aurigae'
  | 'r-draconis';

export type StarSimulationType =
  | 'drift'
  | 'binary'
  | 'infrared'
  | 'variable-dip'
  | 'pulsation';

export interface StarObservationReadout {
  epochLabel: string;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  secondaryMetricLabel: string;
  secondaryMetricValue: string;
}

export const REAL_STAR_IDS: readonly RealStarId[] = [
  'barnards-star',
  'epsilon-indi-b',
  'wise-0855',
  'rw-aurigae',
  'r-draconis',
] as const;

export const STAR_REFERENCE_COORDS: Record<
  RealStarId,
  { raDeg: number; decDeg: number; ra: string; dec: string }
> = {
  'barnards-star': {
    raDeg: 269.4521,
    decDeg: 4.6933,
    ra: '17h 57m 48.5s',
    dec: '+04° 41′ 36″',
  },
  'epsilon-indi-b': {
    raDeg: 331.0438,
    decDeg: -56.7828,
    ra: '22h 04m 10.5s',
    dec: '-56° 46′ 58″',
  },
  'wise-0855': {
    raDeg: 133.7951,
    decDeg: -7.2451,
    ra: '08h 55m 10.831s',
    dec: '-07° 14′ 42.53″',
  },
  'rw-aurigae': {
    raDeg: 76.9563,
    decDeg: 30.4014,
    ra: '05h 07m 49.5s',
    dec: '+30° 24′ 05″',
  },
  'r-draconis': {
    raDeg: 248.1675,
    decDeg: 66.755,
    ra: '16h 32m 40.2s',
    dec: '+66° 45′ 18″',
  },
};

export function pickRandomStarId(
  excludeId?: RealStarId,
  rng: () => number = Math.random,
): RealStarId {
  const pool = excludeId ? REAL_STAR_IDS.filter((id) => id !== excludeId) : REAL_STAR_IDS;
  const clamped = Math.max(0, Math.min(0.999999, rng()));
  const idx = Math.floor(clamped * pool.length);
  return pool[idx] ?? REAL_STAR_IDS[0];
}

/**
 * Parses Right Ascension strings in HMS ("08h55m10.831s", "17 57 48.5", "17:57:48.5")
 * or decimal degrees ("133.795", "133.795 deg") into degrees [0, 360).
 */
export function parseRaToDegrees(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Explicit decimal degrees if no h/m/s/: separators or explicitly ending in d/deg/°
  const decimalMatch = trimmed.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:deg|°|d)?$/i);
  if (decimalMatch) {
    const val = Number(decimalMatch[1]);
    if (!Number.isFinite(val)) return null;
    const wrapped = ((val % 360) + 360) % 360;
    return wrapped;
  }

  // HMS format: 08h 55m 10.831s or 08:55:10.831 or 08 55 10.831
  const hmsMatch = trimmed.match(
    /^(\d{1,2})\s*(?:h|:|\s)\s*(\d{1,2})(?:\s*(?:m|:|\s)\s*(\d{1,2}(?:\.\d+)?))?\s*s?$/i,
  );
  if (hmsMatch) {
    const h = Number(hmsMatch[1]);
    const m = Number(hmsMatch[2]);
    const s = hmsMatch[3] !== undefined ? Number(hmsMatch[3]) : 0;
    if (h < 0 || h >= 24 || m < 0 || m >= 60 || s < 0 || s >= 60) {
      return null;
    }
    return (h + m / 60 + s / 3600) * 15;
  }

  return null;
}

/**
 * Parses Declination strings in DMS ("-7d14m42.53s", "-07° 14′ 42.53″", "+04:41:36")
 * or decimal degrees ("-7.245") into degrees [-90, 90].
 */
export function parseDecToDegrees(raw: string): number | null {
  const trimmed = raw.trim().replace(/−/g, '-');
  if (!trimmed) return null;

  const decimalMatch = trimmed.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:deg|°|d)?$/i);
  if (decimalMatch) {
    const val = Number(decimalMatch[1]);
    if (!Number.isFinite(val) || val < -90 || val > 90) return null;
    return val;
  }

  const dmsMatch = trimmed.match(
    /^([+-])?\s*(\d{1,2})\s*(?:d|deg|°|:|\s)\s*(\d{1,2})(?:\s*(?:m|'|′|:|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:s|"|″)?)?$/i,
  );
  if (dmsMatch) {
    const sign = dmsMatch[1] === '-' ? -1 : 1;
    const d = Number(dmsMatch[2]);
    const m = Number(dmsMatch[3]);
    const s = dmsMatch[4] !== undefined ? Number(dmsMatch[4]) : 0;
    if (d < 0 || d > 90 || m < 0 || m >= 60 || s < 0 || s >= 60) {
      return null;
    }
    const magnitude = d + m / 60 + s / 3600;
    if (magnitude > 90) return null;
    return sign * magnitude;
  }

  return null;
}

export function matchKnownStarByCoords(raDeg: number, decDeg: number): RealStarId | null {
  let bestId: RealStarId | null = null;
  let bestDist = Infinity;

  for (const id of REAL_STAR_IDS) {
    const ref = STAR_REFERENCE_COORDS[id];
    const dRaRaw = Math.abs(raDeg - ref.raDeg);
    const dRa = Math.min(dRaRaw, 360 - dRaRaw);
    const dDec = Math.abs(decDeg - ref.decDeg);
    const dist = Math.hypot(dRa, dDec);
    if (dist < 0.35 && dist < bestDist) {
      bestDist = dist;
      bestId = id;
    }
  }

  return bestId;
}

export function matchKnownStarByQuery(query: string): RealStarId | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (q.includes('barnard')) return 'barnards-star';
  if (q.includes('epsilon') || q.includes('indi')) return 'epsilon-indi-b';
  if (q.includes('wise') || q.includes('0855')) return 'wise-0855';
  if (q.includes('aurigae') || q.includes('rw ')) return 'rw-aurigae';
  if (q.includes('draconis') || q.includes('r drac')) return 'r-draconis';
  return null;
}

export function computeStarObservationReadout(
  starId: RealStarId,
  timeSec: number,
  speedMultiplier = 1,
): StarObservationReadout {
  switch (starId) {
    case 'barnards-star': {
      const pos = computeBarnardPosition(timeSec, speedMultiplier);
      return {
        epochLabel: `EPOCH ${pos.epochYear}`,
        primaryMetricLabel: 'Sky Drift',
        primaryMetricValue: `+${pos.driftArcsec.toFixed(1)}″`,
        secondaryMetricLabel: 'Proper Motion',
        secondaryMetricValue: '10.36″ / yr',
      };
    }
    case 'epsilon-indi-b': {
      const orbit = computeEpsilonIndiOrbit(timeSec, speedMultiplier);
      const orbitYears = orbit.orbitPhase * 15.0;
      const dx = orbit.bb.x - orbit.ba.x;
      const dy = orbit.bb.y - orbit.ba.y;
      const sepAu = Math.hypot(dx, dy) * 7.8;
      return {
        epochLabel: `ORBIT ${(orbit.orbitPhase * 100).toFixed(0)}%`,
        primaryMetricLabel: 'Mutual Year',
        primaryMetricValue: `${orbitYears.toFixed(1)} / 15.0 yr`,
        secondaryMetricLabel: 'Projected Sep',
        secondaryMetricValue: `${sepAu.toFixed(2)} AU`,
      };
    }
    case 'wise-0855': {
      const pos = computeWise0855Position(timeSec, speedMultiplier);
      return {
        epochLabel: `DRIFT +${pos.apparentArcsec.toFixed(0)}″`,
        primaryMetricLabel: 'Cloud Temp',
        primaryMetricValue: `${pos.temperatureKelvin.toFixed(0)} K (${(pos.temperatureKelvin - 273.15).toFixed(0)}°C)`,
        secondaryMetricLabel: 'Proper Motion',
        secondaryMetricValue: '8.11″ / yr',
      };
    }
    case 'rw-aurigae': {
      const rw = computeRwAurigaeOccultation(timeSec, speedMultiplier);
      return {
        epochLabel: rw.occultationFactor > 0.25 ? 'OCCULTATION DIP' : 'BASELINE GLOW',
        primaryMetricLabel: 'Visual Mag',
        primaryMetricValue: `${rw.magnitude.toFixed(2)} V`,
        secondaryMetricLabel: 'Dust Extinction',
        secondaryMetricValue: `${(rw.occultationFactor * 100).toFixed(0)}% dimmed`,
      };
    }
    case 'r-draconis': {
      const rd = computeRDraconisPulsation(timeSec, speedMultiplier);
      return {
        epochLabel: `DAY ${rd.phaseDays} / 246`,
        primaryMetricLabel: 'Visual Mag',
        primaryMetricValue: `${rd.magnitude.toFixed(2)} V`,
        secondaryMetricLabel: 'Radius Scale',
        secondaryMetricValue: `${(rd.radiusScale * 100).toFixed(0)}%`,
      };
    }
  }
}

/**
 * Projects celestial equatorial coordinates (RA deg [0,360), Dec deg [-90,90])
 * onto an interactive all-sky canvas with astronomical east-left orientation
 * (24h on the left -> 0h on the right, +90 deg at top -> -90 deg at bottom).
 */
export function projectSkyAtlasPoint(
  raDeg: number,
  decDeg: number,
  width: number,
  height: number,
  padding = 18,
): { x: number; y: number } {
  const usableW = Math.max(1, width - padding * 2);
  const usableH = Math.max(1, height - padding * 2);
  const wrappedRa = ((raDeg % 360) + 360) % 360;
  const clampedDec = Math.max(-90, Math.min(90, decDeg));
  const x = padding + (1 - wrappedRa / 360) * usableW;
  const y = padding + ((90 - clampedDec) / 180) * usableH;
  return { x, y };
}

/**
 * Safely cycles through carousel star indices with wrap-around for any delta.
 */
export function cycleStarIndex(currentIndex: number, delta: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  return (((currentIndex + delta) % totalCount) + totalCount) % totalCount;
}


