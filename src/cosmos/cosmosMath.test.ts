import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTouchDelta,
  applyWheelDelta,
  computeBloomParams,
  computeChromaticIntensity,
  computeFallingStarParticleState,
  computeLandmarkVisibility,
  computeLayerDisplacement,
  computeMeteorTailProfile,
  computeMilestoneAudioState,
  computeNebulaParallaxParams,
  computeStarTwinkle,
  computeVignetteStrength,
  computeWarpIntensity,
  createRng,
  createScrollerState,
  DEFAULT_SCROLLER_CONFIG,
  LANDMARK_STOPS,
  smoothstep,
  STAR_PARALLAX_LAYERS,
  stepScroller,
  corridorEnvelopeAt,
  corridorCenterX,
  wrapProgress,
  computeBarnardPosition,
  computeEpsilonIndiOrbit,
  computeWise0855Position,
  computeRwAurigaeOccultation,
  computeRDraconisPulsation,
} from './cosmosMath';

test('createRng is deterministic for a fixed seed', () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) {
    assert.ok(v >= 0 && v < 1);
  }
});

test('wrapProgress wraps negative and >=1 progress cleanly into [0, 1)', () => {
  assert.equal(wrapProgress(0), 0);
  assert.ok(Math.abs(wrapProgress(1.25) - 0.25) < 1e-9);
  assert.ok(Math.abs(wrapProgress(-0.2) - 0.8) < 1e-9);
});

test('corridorEnvelopeAt forms a low central star-corridor rising toward outer galactic bounds', () => {
  const z = 30;
  const cx = corridorCenterX(z);
  const centerHeight = corridorEnvelopeAt(cx, z);
  const outerLeft = corridorEnvelopeAt(cx - 26, z);
  const outerRight = corridorEnvelopeAt(cx + 26, z);
  assert.ok(outerLeft > centerHeight + 4, `expected outer left (${outerLeft}) > center (${centerHeight})`);
  assert.ok(outerRight > centerHeight + 4, `expected outer right (${outerRight}) > center (${centerHeight})`);
});

test('virtual scroller drifts forward when idle and eases to stop on hover', () => {
  let state = createScrollerState(0.1);
  for (let i = 0; i < 30; i++) {
    state = stepScroller(state, 1 / 60, 0);
  }
  assert.ok(state.progress > 0.1, 'expected idle forward drift');

  let hovered = state;
  for (let i = 0; i < 120; i++) {
    hovered = stepScroller(hovered, 1 / 60, 1);
  }
  assert.ok(
    Math.abs(hovered.velocity) < DEFAULT_SCROLLER_CONFIG.baseDriftSpeed * 0.15,
    `expected hover freeze to slow velocity near zero, got ${hovered.velocity}`,
  );
});

test('wheel and 20x touch deltas accelerate scroller and tighten vignette', () => {
  const initial = createScrollerState(0);
  const wheeled = applyWheelDelta(initial, 400);
  assert.ok(wheeled.targetVelocity > initial.targetVelocity);

  const touched = applyTouchDelta(initial, 80);
  assert.ok(touched.targetVelocity > initial.targetVelocity);

  const stepped = stepScroller(wheeled, 0.05, 0);
  assert.ok(stepped.speedIntensity > 0);
  assert.ok(computeVignetteStrength(stepped.speedIntensity, 0) > computeVignetteStrength(0, 0));
});

test('smoothstep clamps cleanly at bounds', () => {
  assert.equal(smoothstep(2, 10, 0), 0);
  assert.equal(smoothstep(2, 10, 12), 1);
  assert.equal(smoothstep(0, 10, 5), 0.5);
});

test('computeLandmarkVisibility peaks at destination stop and fades smoothly outside span', () => {
  assert.equal(computeLandmarkVisibility(LANDMARK_STOPS.work, LANDMARK_STOPS.work, 0.16), 1);
  assert.equal(computeLandmarkVisibility(0, LANDMARK_STOPS.work, 0.16), 0);
  const mid = computeLandmarkVisibility(LANDMARK_STOPS.work - 0.08, LANDMARK_STOPS.work, 0.16);
  assert.ok(mid > 0.4 && mid < 0.6);
});

test('computeWarpIntensity clamps cleanly and responds to manual warp or rapid scroll', () => {
  assert.equal(computeWarpIntensity(0.02, 0), 0);
  assert.equal(computeWarpIntensity(0.02, 0.9), 0.9);
  assert.ok(computeWarpIntensity(0.5, 0) > 0.4);
  assert.equal(computeWarpIntensity(5.0, 2.0), 1);
});

test('computeChromaticIntensity increases during movement/warp and disables on reduced motion', () => {
  const rest = computeChromaticIntensity(0, 0, false, 0);
  const scrolling = computeChromaticIntensity(0.22, 0, false, 0);
  const warping = computeChromaticIntensity(0.3, 0.9, false, 0);
  assert.ok(rest > 0 && rest < 0.15);
  assert.ok(scrolling > rest);
  assert.ok(warping > scrolling && warping <= 1);
  assert.equal(computeChromaticIntensity(0.5, 1.0, true, 0), 0);
});

test('computeStarTwinkle produces randomized high-frequency oscillation from starId and stays 1 on reduced motion', () => {
  assert.equal(computeStarTwinkle(4.2, 17, true, 0.2, true), 1);

  const times = [0, 0.08, 0.16, 0.24, 0.32, 0.4];
  const aSamples = times.map((t) => computeStarTwinkle(t, 101, true, 0.2, false));
  const bSamples = times.map((t) => computeStarTwinkle(t, 102, true, 0.2, false));

  for (const v of [...aSamples, ...bSamples]) {
    assert.ok(v >= 0.72 && v <= 1.28, `twinkle ${v} out of expected dynamic bounds`);
  }
  assert.ok(
    Math.max(...aSamples) - Math.min(...aSamples) > 0.16,
    'high-frequency twinkle should oscillate noticeably within sub-second intervals',
  );
  assert.notDeepEqual(aSamples, bSamples, 'distinct star IDs must oscillate independently');
});

test('STAR_PARALLAX_LAYERS and computeLayerDisplacement move distant layers slower than closer layers', () => {
  assert.equal(STAR_PARALLAX_LAYERS.length, 4);
  const displacements = STAR_PARALLAX_LAYERS.map((layer) =>
    computeLayerDisplacement(80, 12, layer.parallaxFactor, layer.flowFactor),
  );
  for (let i = 1; i < displacements.length; i++) {
    assert.ok(
      displacements[i] > displacements[i - 1],
      `expected closer layer (${STAR_PARALLAX_LAYERS[i].id}: ${displacements[i]}) to move faster than ${STAR_PARALLAX_LAYERS[i - 1].id}: ${displacements[i - 1]}`,
    );
  }
});

test('computeFallingStarParticleState models head burnout, persistent wake, and trail cooling', () => {
  assert.deepEqual(computeFallingStarParticleState(2, 0.1, 0.05, 0.38, 0, true), {
    active: false,
    headProgress: 0,
    headPower: 0,
    alpha: 0,
  });

  const inactive = computeFallingStarParticleState(0, 0.65, 0.05, 0.38, 0, false);
  assert.equal(inactive.active, false);
  assert.equal(inactive.alpha, 0);

  const head = computeFallingStarParticleState(2.5, 0.05, 0.05, 0.38, 0, false);
  const mid = computeFallingStarParticleState(2.5, 0.05, 0.05, 0.38, 0.45, false);
  const tail = computeFallingStarParticleState(2.5, 0.05, 0.05, 0.38, 0.95, false);
  assert.equal(head.active, true);
  assert.ok(head.alpha > mid.alpha && mid.alpha > tail.alpha && tail.alpha > 0);

  // Near end of active window (~92%): head has quenched while persistent wake still faintly glows
  const lateTime = (0.38 * 0.92 - 0.05) / 0.05;
  const late = computeFallingStarParticleState(lateTime, 0.05, 0.05, 0.38, 0.35, false);
  assert.equal(late.headPower, 0);
  assert.ok(late.alpha > 0);
});

test('computeMeteorTailProfile stretches during high-speed travel and tapers cleanly to zero at the tail tip', () => {
  const restMid = computeMeteorTailProfile(0.5, 20, 0);
  const fastMid = computeMeteorTailProfile(0.5, 20, 1);
  const head = computeMeteorTailProfile(0, 20, 0.4);
  const tail = computeMeteorTailProfile(1, 20, 0.4);

  assert.ok(fastMid.offsetDist > restMid.offsetDist, 'tail should stretch further during high-speed travel');
  assert.ok(head.halfWidth > restMid.halfWidth && restMid.halfWidth > tail.halfWidth, 'tail width must taper toward tip');
  assert.equal(head.fade, 1);
  assert.equal(tail.fade, 0);
});

test('computeNebulaParallaxParams gives deeper z-visibility and slower scroll parallax for distant nebula clouds', () => {
  const deep = computeNebulaParallaxParams(0, 90, 10);
  const mid = computeNebulaParallaxParams(0.5, 90, 10);
  const near = computeNebulaParallaxParams(1, 90, 10);

  assert.ok(deep.parallax < mid.parallax && mid.parallax < near.parallax);
  assert.ok(deep.zTravel < mid.zTravel && mid.zTravel < near.zTravel);
  assert.ok(deep.farFadeEnd > near.farFadeEnd && deep.farFadeEnd >= 150);
});

test('computeBloomParams enhances soft glow near landmarks/hover/warp and returns calm baseline on reduced motion', () => {
  const reduced = computeBloomParams(0.9, 1, 1, true);
  assert.deepEqual(reduced, { strength: 0.44, radius: 0.64, threshold: 0.56 });

  const rest = computeBloomParams(0, 0, 0, false);
  const landmark = computeBloomParams(0, 0, 1, false);
  const hover = computeBloomParams(0, 1, 0, false);
  const warp = computeBloomParams(1, 0, 0, false);

  assert.ok(landmark.strength > rest.strength && landmark.radius > rest.radius);
  assert.ok(landmark.threshold < rest.threshold);
  assert.ok(hover.strength > rest.strength && hover.radius > rest.radius);
  assert.ok(warp.strength > rest.strength && warp.strength <= 0.92);
});

test('computeMilestoneAudioState maintains deep sub-bass hum at origin and swells synthetic resonance approaching milestones', () => {
  const heroRest = computeMilestoneAudioState(LANDMARK_STOPS.hero, 0);
  assert.equal(heroRest.proximity, 0);
  assert.equal(heroRest.resonanceGain, 0);
  assert.ok(heroRest.deepHumGain >= 0.14);

  const heroFast = computeMilestoneAudioState(LANDMARK_STOPS.hero, 0.8);
  assert.ok(heroFast.deepHumGain > heroRest.deepHumGain);

  const approachingAbout = computeMilestoneAudioState(LANDMARK_STOPS.about - 0.08, 0.25);
  assert.equal(approachingAbout.nearestIndex, 1);
  assert.ok(approachingAbout.proximity > 0.5 && approachingAbout.proximity < 1);
  assert.ok(approachingAbout.resonanceGain > 0);
  assert.ok(approachingAbout.resonanceCutoffHz > heroRest.resonanceCutoffHz);

  const atStops = [
    LANDMARK_STOPS.work,
    LANDMARK_STOPS.about,
    LANDMARK_STOPS.journal,
    LANDMARK_STOPS.contact,
  ];
  atStops.forEach((stop, idx) => {
    const state = computeMilestoneAudioState(stop, 0);
    assert.equal(state.nearestIndex, idx);
    assert.equal(state.proximity, 1);
    assert.ok(state.resonanceGain >= 0.14);
    assert.ok(state.deepHumGain > heroRest.deepHumGain);
  });
});

test('star target dynamics models correctly compute coordinates and dynamics for 5 showcase stars', () => {
  // 1. Barnard's Star: Proper motion drift and epoch advancement
  const barnardStart = computeBarnardPosition(0);
  const barnardMid = computeBarnardPosition(5); // 5s is halfway through 10s loop
  assert.equal(barnardStart.epochYear, 2026);
  assert.equal(barnardStart.driftArcsec, 0);
  assert.equal(barnardMid.epochYear, 2051);
  assert.ok(barnardMid.x > barnardStart.x);
  assert.ok(barnardMid.driftArcsec > 250);

  // 2. Epsilon Indi B: Binary brown dwarf orbit
  const orbit0 = computeEpsilonIndiOrbit(0);
  const orbitHalf = computeEpsilonIndiOrbit(4); // 4s in 8s period
  assert.ok(Math.abs(orbit0.ba.x - (1 - orbit0.bb.x)) < 0.2);
  assert.notEqual(orbit0.ba.x, orbitHalf.ba.x);

  // 3. WISE 0855: Sub-brown dwarf coordinates and cold temperatures
  const wiseStart = computeWise0855Position(0);
  const wiseLater = computeWise0855Position(4.5);
  assert.ok(wiseStart.temperatureKelvin >= 225 && wiseStart.temperatureKelvin <= 260);
  assert.ok(wiseLater.apparentArcsec > 0);
  assert.ok(wiseLater.x > wiseStart.x);

  // 4. RW Aurigae: Episodic dust stream occultation
  const rwBase = computeRwAurigaeOccultation(1); // outside dip
  const rwDip = computeRwAurigaeOccultation(6); // inside dip (0.5 phase)
  assert.equal(rwBase.magnitude, 9.6);
  assert.ok(rwDip.magnitude > 13.0 && rwDip.magnitude <= 13.6);
  assert.ok(rwDip.streamDensity > rwBase.streamDensity);

  // 5. R Draconis: 245-day Mira pulsating giant
  const rD0 = computeRDraconisPulsation(0); // sine(0) = 0
  const rDMax = computeRDraconisPulsation(2.5); // 1/4 of 10s -> max expansion
  const rDMin = computeRDraconisPulsation(7.5); // 3/4 of 10s -> min contraction
  assert.ok(rDMax.radiusScale > 1.35);
  assert.ok(rDMin.radiusScale < 0.65);
  assert.ok(rDMax.magnitude < 7.0); // brightest
  assert.ok(rDMin.magnitude > 13.0); // dimmest
});

