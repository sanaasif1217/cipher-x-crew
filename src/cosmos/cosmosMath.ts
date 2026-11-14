/**
 * Pure mathematical utilities for the Watch the Sky Change — SPHEREx Galaxy Journey:
 * - Deterministic PRNG for reproducible starfields
 * - Star-corridor envelope math & smoothstep/damping helpers
 * - Scroll-driven celestial landmark visibility & warp-jump intensity math
 * - Virtual scroller physics (kept for compatibility + idle drift)
 */

export interface ScrollerState {
  /** Normalized progress along the path [0, 1) */
  progress: number;
  /** Instantaneous velocity along path (progress units / sec) */
  velocity: number;
  /** Accumulated impulse from wheel / touch waiting to be damped */
  targetVelocity: number;
  /** Smoothed speed magnitude [0, 1] used to tighten the vignette */
  speedIntensity: number;
}

export interface ScrollerConfig {
  baseDriftSpeed: number;
  wheelSensitivity: number;
  touchMultiplier: number;
  damping: number;
  maxVelocity: number;
}

export const DEFAULT_SCROLLER_CONFIG: ScrollerConfig = {
  baseDriftSpeed: 0.011,
  wheelSensitivity: 0.00011,
  touchMultiplier: 20,
  damping: 4.5,
  maxVelocity: 0.22,
};

export const LANDMARK_STOPS = {
  hero: 0,
  work: 0.28,
  about: 0.54,
  explore: 0.54,
  journal: 0.78,
  contact: 0.96,
} as const;

export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * Math.max(0, dt)));
}

export function wrapProgress(value: number): number {
  const mod = value % 1;
  return mod < 0 ? mod + 1 : mod;
}

export function corridorCenterX(z: number): number {
  return Math.sin(z * 0.045) * 6.5 + Math.cos(z * 0.021) * 3.2;
}

export function corridorEnvelopeAt(x: number, z: number): number {
  const cx = corridorCenterX(z);
  const lateralDist = Math.abs(x - cx);
  const corridorRim = Math.pow(smoothstep(3.5, 28, lateralDist), 1.45) * 8.4;

  const undulation =
    Math.sin(x * 0.14 + z * 0.09) * 0.85 +
    Math.cos(x * 0.07 - z * 0.12) * 0.65 +
    Math.sin(x * 0.31 + z * 0.27) * 0.24;

  return corridorRim + undulation - 1.4;
}

export function createScrollerState(initialProgress = 0): ScrollerState {
  return {
    progress: wrapProgress(initialProgress),
    velocity: DEFAULT_SCROLLER_CONFIG.baseDriftSpeed,
    targetVelocity: DEFAULT_SCROLLER_CONFIG.baseDriftSpeed,
    speedIntensity: 0,
  };
}

export function applyWheelDelta(
  state: ScrollerState,
  deltaY: number,
  config: ScrollerConfig = DEFAULT_SCROLLER_CONFIG,
): ScrollerState {
  const impulse = deltaY * config.wheelSensitivity;
  const nextTarget = Math.max(
    -config.maxVelocity,
    Math.min(config.maxVelocity, state.targetVelocity + impulse),
  );
  return {
    ...state,
    targetVelocity: nextTarget,
  };
}

export function applyTouchDelta(
  state: ScrollerState,
  deltaY: number,
  config: ScrollerConfig = DEFAULT_SCROLLER_CONFIG,
): ScrollerState {
  const scaledDelta = deltaY * config.touchMultiplier;
  const impulse = scaledDelta * config.wheelSensitivity * 0.14;
  const nextTarget = Math.max(
    -config.maxVelocity,
    Math.min(config.maxVelocity, state.targetVelocity + impulse),
  );
  return {
    ...state,
    targetVelocity: nextTarget,
  };
}

export function stepScroller(
  state: ScrollerState,
  dt: number,
  hoverFreeze: number,
  config: ScrollerConfig = DEFAULT_SCROLLER_CONFIG,
): ScrollerState {
  const clampedDt = Math.min(Math.max(dt, 0), 0.1);
  const drift = config.baseDriftSpeed * (1 - hoverFreeze);

  const nextTargetVelocity = damp(state.targetVelocity, drift, 2.2, clampedDt);
  const desiredVel = nextTargetVelocity * (1 - hoverFreeze * 0.96);
  const nextVelocity = damp(state.velocity, desiredVel, config.damping, clampedDt);
  const nextProgress = wrapProgress(state.progress + nextVelocity * clampedDt);

  const excessSpeed = Math.max(0, Math.abs(nextVelocity) - config.baseDriftSpeed);
  const rawIntensity = Math.min(1, excessSpeed / (config.maxVelocity * 0.55));
  const nextSpeedIntensity = damp(state.speedIntensity, rawIntensity, 5.0, clampedDt);

  return {
    progress: nextProgress,
    velocity: nextVelocity,
    targetVelocity: nextTargetVelocity,
    speedIntensity: nextSpeedIntensity,
  };
}

export function computeVignetteStrength(speedIntensity: number, hoverMix: number): number {
  const clampedSpeed = Math.max(0, Math.min(1, speedIntensity));
  const clampedHover = Math.max(0, Math.min(1, hoverMix));
  return 0.42 + clampedSpeed * 0.38 + clampedHover * 0.14;
}

/**
 * Computes [0, 1] visibility for a destination landmark as scrollProgress approaches targetProgress.
 */
export function computeLandmarkVisibility(
  scrollProgress: number,
  targetProgress: number,
  halfSpan = 0.16,
): number {
  const distance = Math.abs(scrollProgress - targetProgress);
  if (distance >= halfSpan) return 0;
  return 1 - smoothstep(0, halfSpan, distance);
}

/**
 * Computes clamped [0, 1] warp streak intensity from scroll velocity and active warp jump trigger.
 */
export function computeWarpIntensity(scrollVelocity: number, manualWarp: number): number {
  const velocityContribution = Math.min(0.85, Math.max(0, (Math.abs(scrollVelocity) - 0.14) * 1.4));
  return Math.max(0, Math.min(1, Math.max(velocityContribution, manualWarp)));
}

/**
 * Computes subtle optical chromatic aberration intensity [0, 1] that remains faint at
 * cruise drift and increases smoothly with scroll speed and warp jumps.
 */
export function computeChromaticIntensity(
  scrollVelocity: number,
  warpIntensity: number,
  reducedMotion: boolean,
  hoverMix = 0,
): number {
  if (reducedMotion) return 0;
  const baseDrift = 0.08 * (1 - Math.max(0, Math.min(1, hoverMix)) * 0.65);
  const speedContribution = Math.min(0.55, Math.abs(scrollVelocity) * 2.4);
  const warpContribution = Math.max(0, Math.min(1, warpIntensity)) * 0.72;
  return Math.max(0, Math.min(1, baseDrift + speedContribution + warpContribution));
}

/**
 * Computes randomized, non-synchronized star brightness oscillation using a
 * high-frequency sine wave driven by each star's unique ID and elapsed time.
 */
export function computeStarTwinkle(
  timeSec: number,
  starId: number,
  isStaticSky: boolean,
  magnitude: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 1;
  const clampedMag = Math.max(0, Math.min(1, magnitude));
  const fract = (x: number) => x - Math.floor(x);
  const idHash1 = fract(Math.sin(starId * 12.9898 + 78.233) * 43758.5453);
  const idHash2 = fract(Math.sin(starId * 93.9898 + 67.345) * 24634.6345);
  const idHash3 = fract(Math.sin(starId * 41.231 + 19.871) * 15731.7431);

  const highFreq = 8.5 + idHash1 * 13.5;
  const modFreq = 2.4 + idHash2 * 4.2;
  const phaseA = idHash2 * Math.PI * 2 + starId * 0.713;
  const phaseB = idHash3 * Math.PI * 2;

  const fastWave = Math.sin(timeSec * highFreq + phaseA);
  const envelopeWave = 0.55 + 0.45 * Math.sin(timeSec * modFreq + phaseB);
  const osc = fastWave * envelopeWave;

  const baseAmp = isStaticSky ? 0.26 : 0.20;
  const magAttenuation = 1 - clampedMag * 0.28;
  return 1 + osc * baseAmp * magAttenuation;
}

export interface StarParallaxLayerConfig {
  id: 'deep' | 'far' | 'mid' | 'near';
  count: number;
  parallaxFactor: number;
  flowFactor: number;
  sizeScale: number;
  zSpan: number;
}

export const STAR_PARALLAX_LAYERS: readonly StarParallaxLayerConfig[] = [
  { id: 'deep', count: 10000, parallaxFactor: 0.04, flowFactor: 0.05, sizeScale: 0.92, zSpan: 280 },
  { id: 'far', count: 3600, parallaxFactor: 0.28, flowFactor: 0.28, sizeScale: 0.78, zSpan: 240 },
  { id: 'mid', count: 3200, parallaxFactor: 0.72, flowFactor: 0.72, sizeScale: 1.0, zSpan: 200 },
  { id: 'near', count: 1700, parallaxFactor: 1.55, flowFactor: 1.45, sizeScale: 1.24, zSpan: 150 },
] as const;

/**
 * Computes relative forward star travel for a depth layer during scroll and ambient drift.
 * Distant layers (smaller parallaxFactor) move slower than closer layers.
 */
export function computeLayerDisplacement(
  scrollTravelZ: number,
  flowZ: number,
  parallaxFactor: number,
  flowFactor: number,
): number {
  return scrollTravelZ * parallaxFactor + flowZ * flowFactor;
}

/**
 * Computes normalized atmospheric ablation state and trail brightness for a distant meteoroid.
 * Models entry ramp, brief terminal ablation flare (~72% progress), head burnout (~85%),
 * and lingering persistent ionization wake dissipation through the end of the active window.
 */
export function computeFallingStarParticleState(
  timeSec: number,
  seed: number,
  speed: number,
  activeWindow: number,
  trailFraction: number,
  reducedMotion: boolean,
): { active: boolean; headProgress: number; headPower: number; alpha: number } {
  if (reducedMotion) {
    return { active: false, headProgress: 0, headPower: 0, alpha: 0 };
  }
  const raw = seed + timeSec * speed;
  const cycle = raw - Math.floor(raw);
  if (cycle >= activeWindow) {
    return { active: false, headProgress: 0, headPower: 0, alpha: 0 };
  }
  const u = cycle / activeWindow;
  const entry = smoothstep(0, 0.18, u);
  const headBurnout = 1 - smoothstep(0.75, 0.89, u);
  const flare = Math.exp(-Math.pow((u - 0.72) / 0.09, 2)) * 0.42;
  const headPower = entry * headBurnout * (1 + flare);
  const wakeFade = entry * (1 - smoothstep(0.58, 1, u));

  const clampedFrac = Math.max(0, Math.min(1, trailFraction));
  const headTerm = Math.exp(-clampedFrac * 24) * headPower;
  const wakeTerm = Math.pow(1 - clampedFrac, 2.1) * wakeFade * 0.62;
  return {
    active: true,
    headProgress: Math.min(u, 0.86) + Math.max(0, u - 0.86) * 0.25,
    headPower,
    alpha: Math.min(1, headTerm + wakeTerm),
  };
}

/**
 * Computes vertex-interpolated meteor tail stretch, width taper, and smooth opacity fade
 * as a function of normalized trail position [0..1] and viewer travel speed [0..1].
 */
export function computeMeteorTailProfile(
  trailFraction: number,
  baseLength: number,
  travelSpeed: number,
): { offsetDist: number; halfWidth: number; fade: number } {
  const frac = Math.max(0, Math.min(1, trailFraction));
  const speed = Math.max(0, Math.min(1, travelSpeed));
  const stretchFactor = 1 + speed * 1.15;
  const curvedFrac = Math.pow(frac, 1.18 + speed * 0.3);
  const offsetDist = curvedFrac * baseLength * stretchFactor;

  const comaRadius = 0.3;
  const tipRadius = 0.03;
  const speedTighten = 1 - speed * 0.22;
  const halfWidth = (comaRadius + (tipRadius - comaRadius) * Math.pow(frac, 0.72)) * speedTighten;

  const tailDecay = Math.pow(1 - frac, 1.85);
  const tipFeather = 1 - smoothstep(0.76, 1, frac);
  const fade = tailDecay * tipFeather;

  return { offsetDist, halfWidth, fade };
}

/**
 * Computes depth-stratified parallax multiplier, flow scale, z-displacement, and far-fade bounds
 * for nebula particles given a normalized depth factor [0 = deep background, 1 = foreground].
 */
export function computeNebulaParallaxParams(
  depthNorm: number,
  scrollTravelZ: number,
  flowZ: number,
): { parallax: number; flowScale: number; zTravel: number; farFadeEnd: number } {
  const d = Math.max(0, Math.min(1, depthNorm));
  const parallax = 0.24 + (1.72 - 0.24) * d;
  const flowScale = 0.32 + (1.48 - 0.32) * d;
  const zTravel = scrollTravelZ * parallax + flowZ * flowScale;
  const farFadeEnd = 154 - (154 - 96) * d;
  return { parallax, flowScale, zTravel, farFadeEnd };
}

/**
 * Computes soft, ethereal UnrealBloomPass parameters driven by warp speed,
 * hover dispersion, and sector landmark proximity.
 */
export function computeBloomParams(
  warpIntensity: number,
  hoverMix: number,
  landmarkVisibility: number,
  reducedMotion: boolean,
): { strength: number; radius: number; threshold: number } {
  if (reducedMotion) {
    return { strength: 0.44, radius: 0.64, threshold: 0.56 };
  }
  const warp = Math.max(0, Math.min(1, warpIntensity));
  const hover = Math.max(0, Math.min(1, hoverMix));
  const landmark = Math.max(0, Math.min(1, landmarkVisibility));

  const strength = 0.56 + landmark * 0.14 + hover * 0.12 + warp * 0.16;
  const radius = 0.72 + landmark * 0.08 + hover * 0.1;
  const threshold = 0.52 - landmark * 0.06 - hover * 0.05 + warp * 0.04;
  return {
    strength: Math.min(0.92, strength),
    radius: Math.min(0.92, radius),
    threshold: Math.max(0.38, Math.min(0.62, threshold)),
  };
}

export interface MilestoneAudioState {
  proximity: number;
  nearestIndex: number;
  deepHumGain: number;
  resonanceGain: number;
  resonanceCutoffHz: number;
}

/**
 * Computes continuous deeper space hum gain and synthetic milestone resonance parameters
 * as the viewer travels through space and approaches major destination milestones.
 */
export function computeMilestoneAudioState(
  scrollProgress: number,
  speedScalar: number,
): MilestoneAudioState {
  const stops = [
    LANDMARK_STOPS.work,
    LANDMARK_STOPS.about,
    LANDMARK_STOPS.journal,
    LANDMARK_STOPS.contact,
  ];
  const progress = wrapProgress(scrollProgress);
  const speed = Math.max(0, Math.min(1, speedScalar));

  let nearestIndex = 0;
  let minDistance = Infinity;
  let peakProximity = 0;

  for (let i = 0; i < stops.length; i++) {
    const dist = Math.abs(progress - stops[i]);
    if (dist < minDistance) {
      minDistance = dist;
      nearestIndex = i;
    }
    const vis = computeLandmarkVisibility(progress, stops[i], 0.2);
    if (vis > peakProximity) {
      peakProximity = vis;
    }
  }

  const deepHumGain = 0.16 + speed * 0.09 + peakProximity * 0.07;
  const resonanceGain = peakProximity * (0.14 + speed * 0.03);
  const resonanceCutoffHz = 190 + peakProximity * 420 + speed * 90;

  return {
    proximity: peakProximity,
    nearestIndex,
    deepHumGain,
    resonanceGain,
    resonanceCutoffHz,
  };
}

/**
 * Celestial Target Dynamics Models (Sector 02 Interactive Tool)
 */
export interface BarnardPosition {
  x: number;
  y: number;
  epochYear: number;
  driftArcsec: number;
}

export function computeBarnardPosition(tSeconds: number, speedMultiplier = 1): BarnardPosition {
  const loopDuration = 10;
  const progress = ((tSeconds * speedMultiplier) % loopDuration + loopDuration) % loopDuration / loopDuration;
  const x = 0.2 + progress * 0.6;
  const y = 0.75 - progress * 0.5;
  const epochYear = 2026 + Math.round(progress * 50);
  const driftArcsec = progress * 50 * 10.36;
  return { x, y, epochYear, driftArcsec };
}

export interface EpsilonIndiOrbit {
  ba: { x: number; y: number };
  bb: { x: number; y: number };
  orbitPhase: number;
}

export function computeEpsilonIndiOrbit(tSeconds: number, speedMultiplier = 1): EpsilonIndiOrbit {
  const period = 8;
  const phase = ((tSeconds * speedMultiplier) % period + period) % period / period;
  const angle = phase * Math.PI * 2;
  const rx = 0.22;
  const ry = 0.12;
  const ba = {
    x: 0.5 - Math.cos(angle) * (rx * 0.45),
    y: 0.5 - Math.sin(angle) * (ry * 0.45),
  };
  const bb = {
    x: 0.5 + Math.cos(angle) * (rx * 0.75),
    y: 0.5 + Math.sin(angle) * (ry * 0.75),
  };
  return { ba, bb, orbitPhase: phase };
}

export interface Wise0855Position {
  x: number;
  y: number;
  temperatureKelvin: number;
  apparentArcsec: number;
}

export function computeWise0855Position(tSeconds: number, speedMultiplier = 1): Wise0855Position {
  const loopDuration = 9;
  const progress = ((tSeconds * speedMultiplier) % loopDuration + loopDuration) % loopDuration / loopDuration;
  const x = 0.15 + progress * 0.7;
  const y = 0.35 + Math.sin(progress * Math.PI) * 0.18;
  const apparentArcsec = progress * 40 * 8.11;
  const temperatureKelvin = 240 + Math.sin(progress * Math.PI * 4) * 12;
  return { x, y, temperatureKelvin, apparentArcsec };
}

export interface RwAurigaeState {
  magnitude: number;
  occultationFactor: number;
  streamDensity: number;
}

export function computeRwAurigaeOccultation(tSeconds: number, speedMultiplier = 1): RwAurigaeState {
  const cycle = 12;
  const progress = ((tSeconds * speedMultiplier) % cycle + cycle) % cycle / cycle;
  let dip = 0;
  if (progress >= 0.3 && progress <= 0.7) {
    const local = (progress - 0.3) / 0.4;
    dip = Math.sin(local * Math.PI);
  }
  const magnitude = 9.6 + dip * 4.0;
  const occultationFactor = dip;
  const streamDensity = 0.3 + dip * 0.7;
  return { magnitude, occultationFactor, streamDensity };
}

export interface RDraconisState {
  radiusScale: number;
  magnitude: number;
  phaseDays: number;
}

export function computeRDraconisPulsation(tSeconds: number, speedMultiplier = 1): RDraconisState {
  const periodSeconds = 10;
  const progress = ((tSeconds * speedMultiplier) % periodSeconds + periodSeconds) % periodSeconds / periodSeconds;
  const phaseDays = Math.round(progress * 245.6);
  const osc = Math.sin(progress * Math.PI * 2);
  const radiusScale = 1.0 + osc * 0.42;
  const magnitude = 9.95 - osc * 3.25;
  return { radiusScale, magnitude, phaseDays };
}

