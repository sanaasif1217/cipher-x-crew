import test from 'node:test';
import assert from 'node:assert/strict';
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
} from './starObservationMath';

test('pickRandomStarId returns valid real star ids and honors exclusion', () => {
  for (const excluded of REAL_STAR_IDS) {
    const picked = pickRandomStarId(excluded, () => 0.42);
    assert.ok(REAL_STAR_IDS.includes(picked));
    assert.notEqual(picked, excluded);
  }
  assert.equal(pickRandomStarId(undefined, () => 0), 'barnards-star');
  assert.equal(pickRandomStarId(undefined, () => 0.99), 'r-draconis');
});

test('parseRaToDegrees and parseDecToDegrees parse HMS/DMS and decimal formats accurately', () => {
  const wiseRa = parseRaToDegrees('08h55m10.831s');
  const wiseDec = parseDecToDegrees('-7d14m42.53s');
  assert.ok(wiseRa !== null && Math.abs(wiseRa - 133.7951) < 0.001);
  assert.ok(wiseDec !== null && Math.abs(wiseDec - -7.2451) < 0.001);
  assert.equal(matchKnownStarByCoords(wiseRa!, wiseDec!), 'wise-0855');

  const barnardRa = parseRaToDegrees('17h 57m 48.5s');
  const barnardDec = parseDecToDegrees('+04° 41′ 36″');
  assert.ok(barnardRa !== null && barnardDec !== null);
  assert.equal(matchKnownStarByCoords(barnardRa!, barnardDec!), 'barnards-star');

  // Decimal degrees & space-separated formats
  assert.equal(parseRaToDegrees('180.5'), 180.5);
  assert.equal(parseDecToDegrees('-45.25'), -45.25);
  assert.ok(Math.abs((parseRaToDegrees('12 00 00') ?? 0) - 180) < 1e-6);

  // Invalid inputs return null
  assert.equal(parseRaToDegrees('25h 00m 00s'), null);
  assert.equal(parseDecToDegrees('-95d 00m 00s'), null);
  assert.equal(parseRaToDegrees('not-a-coord'), null);
});

test('matchKnownStarByQuery resolves showcase star names', () => {
  assert.equal(matchKnownStarByQuery("Barnard's Star"), 'barnards-star');
  assert.equal(matchKnownStarByQuery('WISE 0855 (RA 08h55m10.831s)'), 'wise-0855');
  assert.equal(matchKnownStarByQuery('r draconis'), 'r-draconis');
  assert.equal(matchKnownStarByQuery('unknown nebula'), null);
});

test('computeStarObservationReadout returns live epoch telemetry across all 5 stars', () => {
  const barnardEarly = computeStarObservationReadout('barnards-star', 0, 1);
  const barnardLate = computeStarObservationReadout('barnards-star', 5, 1);
  assert.equal(barnardEarly.epochLabel, 'EPOCH 2026');
  assert.equal(barnardLate.epochLabel, 'EPOCH 2051');
  assert.notEqual(barnardEarly.primaryMetricValue, barnardLate.primaryMetricValue);

  const eps = computeStarObservationReadout('epsilon-indi-b', 2, 1);
  assert.match(eps.epochLabel, /^ORBIT \d+%$/);
  assert.match(eps.primaryMetricValue, /\/ 15\.0 yr$/);

  const wise = computeStarObservationReadout('wise-0855', 4.5, 1);
  assert.match(wise.primaryMetricValue, /K \(/);
  assert.equal(wise.secondaryMetricValue, '8.11″ / yr');

  const rwBase = computeStarObservationReadout('rw-aurigae', 1, 1);
  const rwDip = computeStarObservationReadout('rw-aurigae', 6, 1);
  assert.equal(rwBase.epochLabel, 'BASELINE GLOW');
  assert.equal(rwDip.epochLabel, 'OCCULTATION DIP');

  const rDrac = computeStarObservationReadout('r-draconis', 2.5, 1);
  assert.match(rDrac.epochLabel, /^DAY \d+ \/ 246$/);
  assert.match(rDrac.primaryMetricValue, /V$/);
});

test('projectSkyAtlasPoint maps celestial coordinates inside canvas bounds with north up', () => {
  const rDrac = STAR_REFERENCE_COORDS['r-draconis'];
  const eps = STAR_REFERENCE_COORDS['epsilon-indi-b'];
  const pDrac = projectSkyAtlasPoint(rDrac.raDeg, rDrac.decDeg, 320, 140, 16);
  const pEps = projectSkyAtlasPoint(eps.raDeg, eps.decDeg, 320, 140, 16);
  assert.ok(pDrac.x >= 16 && pDrac.x <= 304);
  assert.ok(pEps.x >= 16 && pEps.x <= 304);
  assert.ok(pDrac.y < pEps.y, 'Northern declination (+66) should project higher than southern (-56)');
});

test('cycleStarIndex wraps cleanly in both forward and backward directions', () => {
  assert.equal(cycleStarIndex(0, 1, 5), 1);
  assert.equal(cycleStarIndex(4, 1, 5), 0);
  assert.equal(cycleStarIndex(0, -1, 5), 4);
  assert.equal(cycleStarIndex(2, -1, 5), 1);
  assert.equal(cycleStarIndex(0, -6, 5), 4);
});


