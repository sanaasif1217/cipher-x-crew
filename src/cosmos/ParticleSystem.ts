import * as THREE from 'three';
import { createRng } from './cosmosMath';

export interface ParticleSystemOptions {
  /** Number of independent distant meteoroid trajectories (default: 6) */
  meteorCount?: number;
  /** Number of micro-ablation spark particles per meteoroid (default: 24) */
  particlesPerMeteor?: number;
  /** Initial renderer pixel ratio */
  pixelRatio?: number;
}

/**
 * Physical meteoroid ParticleSystem combining:
 * 1. A seamless, multi-segment incandescent plasma wake & persistent ionization train
 *    with realistic blackbody-to-[OI]/sodium spectral cooling, micro-ablation flare,
 *    and post-burnout afterglow decay.
 * 2. Shedding micro-ablation spark & ember particles (`THREE.Points`) that decelerate
 *    and disperse softly behind the incandescent coma.
 *
 * Both layers execute in 2 single GPU draw calls with zero per-frame JS allocations.
 */
export class ParticleSystem {
  public readonly group: THREE.Group;
  public readonly points: THREE.Points;
  public readonly wakeMesh: THREE.Mesh;
  public readonly material: THREE.ShaderMaterial;
  public readonly wakeMaterial: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly wakeGeometry: THREE.BufferGeometry;

  constructor(options: ParticleSystemOptions = {}) {
    const meteorCount = options.meteorCount ?? 6;
    const sparksPerMeteor = options.particlesPerMeteor ?? 24;
    const pixelRatio = options.pixelRatio ?? 1;

    this.group = new THREE.Group();

    const rng = createRng(82461);
    // Physically grounded meteoroid composition classes:
    // Fast Perseid/Leonid (cyan-white nitrogen + green [OI] afterglow) & Silicate/Iron (warm gold + amber wake)
    const meteorClasses = [
      {
        head: new THREE.Color('#fff9ee'),
        neck: new THREE.Color('#ffdca6'),
        wake: new THREE.Color('#8ec8b8'), // classic [OI] forbidden oxygen green-teal afterglow
      },
      {
        head: new THREE.Color('#f4f9ff'),
        neck: new THREE.Color('#a6d8ff'),
        wake: new THREE.Color('#74b8c8'), // high-velocity ionized N2+ / [OI] train
      },
      {
        head: new THREE.Color('#fff5e4'),
        neck: new THREE.Color('#ffbe82'),
        wake: new THREE.Color('#c87e58'), // iron/sodium silicate warm ember train
      },
      {
        head: new THREE.Color('#f9f6ff'),
        neck: new THREE.Color('#c8d4ff'),
        wake: new THREE.Color('#92a8d8'), // faint magnesium-calcium blue-violet
      },
    ];

    // Pre-generate shared meteoroid trajectory descriptors
    const tracks: Array<{
      ox: number;
      oy: number;
      oz: number;
      ndx: number;
      ndy: number;
      ndz: number;
      seed: number;
      speed: number;
      length: number;
      travelDist: number;
      palette: (typeof meteorClasses)[number];
    }> = [];

    for (let m = 0; m < meteorCount; m++) {
      const ox = -14 + rng() * 112;
      const oy = 14 + rng() * 36;
      const oz = -114 - rng() * 44;

      const dx = -(0.68 + rng() * 0.14);
      const dy = -(0.58 + rng() * 0.14);
      const dz = (rng() - 0.5) * 0.06;
      const dirLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

      tracks.push({
        ox,
        oy,
        oz,
        ndx: dx / dirLen,
        ndy: dy / dirLen,
        ndz: dz / dirLen,
        seed: ((m / meteorCount) + rng() * 0.075) % 1,
        speed: 0.044 + rng() * 0.024,
        length: 17.0 + rng() * 12.0,
        travelDist: 44.0 + rng() * 14.0,
        palette: meteorClasses[Math.floor(rng() * meteorClasses.length)],
      });
    }

    // -----------------------------------------------------------------------
    // Layer 1: Seamless Multi-Segment Ablation Plasma & Ionization Wake Mesh
    // -----------------------------------------------------------------------
    const segs = 12;
    const vertsPerMeteor = (segs + 1) * 2;
    const trisPerMeteor = segs * 2;
    const wVertCount = meteorCount * vertsPerMeteor;
    const wIdxCount = meteorCount * trisPerMeteor * 3;

    const wPositions = new Float32Array(wVertCount * 3);
    const wOrigins = new Float32Array(wVertCount * 3);
    const wDirs = new Float32Array(wVertCount * 3);
    const wCoords = new Float32Array(wVertCount * 2); // x: along [0=head..1=tail], y: side [-1..+1]
    const wSeeds = new Float32Array(wVertCount);
    const wSpeeds = new Float32Array(wVertCount);
    const wLengths = new Float32Array(wVertCount);
    const wTravel = new Float32Array(wVertCount);
    const wHeadCols = new Float32Array(wVertCount * 3);
    const wNeckCols = new Float32Array(wVertCount * 3);
    const wWakeCols = new Float32Array(wVertCount * 3);
    const wIndices = new Uint16Array(wIdxCount);

    for (let m = 0; m < meteorCount; m++) {
      const tr = tracks[m];
      const baseV = m * vertsPerMeteor;

      for (let s = 0; s <= segs; s++) {
        const along = s / segs;
        for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
          const vi = baseV + s * 2 + sideIdx;
          const side = sideIdx === 0 ? -1 : 1;

          wPositions[vi * 3] = tr.ox;
          wPositions[vi * 3 + 1] = tr.oy;
          wPositions[vi * 3 + 2] = tr.oz;

          wOrigins[vi * 3] = tr.ox;
          wOrigins[vi * 3 + 1] = tr.oy;
          wOrigins[vi * 3 + 2] = tr.oz;

          wDirs[vi * 3] = tr.ndx;
          wDirs[vi * 3 + 1] = tr.ndy;
          wDirs[vi * 3 + 2] = tr.ndz;

          wCoords[vi * 2] = along;
          wCoords[vi * 2 + 1] = side;

          wSeeds[vi] = tr.seed;
          wSpeeds[vi] = tr.speed;
          wLengths[vi] = tr.length;
          wTravel[vi] = tr.travelDist;

          wHeadCols[vi * 3] = tr.palette.head.r;
          wHeadCols[vi * 3 + 1] = tr.palette.head.g;
          wHeadCols[vi * 3 + 2] = tr.palette.head.b;

          wNeckCols[vi * 3] = tr.palette.neck.r;
          wNeckCols[vi * 3 + 1] = tr.palette.neck.g;
          wNeckCols[vi * 3 + 2] = tr.palette.neck.b;

          wWakeCols[vi * 3] = tr.palette.wake.r;
          wWakeCols[vi * 3 + 1] = tr.palette.wake.g;
          wWakeCols[vi * 3 + 2] = tr.palette.wake.b;
        }

        if (s < segs) {
          const i0 = baseV + s * 2;
          const ii = (m * segs + s) * 6;
          wIndices[ii] = i0;
          wIndices[ii + 1] = i0 + 1;
          wIndices[ii + 2] = i0 + 2;
          wIndices[ii + 3] = i0 + 1;
          wIndices[ii + 4] = i0 + 3;
          wIndices[ii + 5] = i0 + 2;
        }
      }
    }

    this.wakeGeometry = new THREE.BufferGeometry();
    this.wakeGeometry.setAttribute('position', new THREE.BufferAttribute(wPositions, 3));
    this.wakeGeometry.setAttribute('aOrigin', new THREE.BufferAttribute(wOrigins, 3));
    this.wakeGeometry.setAttribute('aDir', new THREE.BufferAttribute(wDirs, 3));
    this.wakeGeometry.setAttribute('aCoord', new THREE.BufferAttribute(wCoords, 2));
    this.wakeGeometry.setAttribute('aSeed', new THREE.BufferAttribute(wSeeds, 1));
    this.wakeGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(wSpeeds, 1));
    this.wakeGeometry.setAttribute('aLength', new THREE.BufferAttribute(wLengths, 1));
    this.wakeGeometry.setAttribute('aTravel', new THREE.BufferAttribute(wTravel, 1));
    this.wakeGeometry.setAttribute('aHeadCol', new THREE.BufferAttribute(wHeadCols, 3));
    this.wakeGeometry.setAttribute('aNeckCol', new THREE.BufferAttribute(wNeckCols, 3));
    this.wakeGeometry.setAttribute('aWakeCol', new THREE.BufferAttribute(wWakeCols, 3));
    this.wakeGeometry.setIndex(new THREE.BufferAttribute(wIndices, 1));

    this.wakeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHoverMix: { value: 0 },
        uTravelSpeed: { value: 0 },
        uReducedMotion: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aOrigin;
        attribute vec3 aDir;
        attribute vec2 aCoord;
        attribute float aSeed;
        attribute float aSpeed;
        attribute float aLength;
        attribute float aTravel;
        attribute vec3 aHeadCol;
        attribute vec3 aNeckCol;
        attribute vec3 aWakeCol;

        uniform float uTime;
        uniform float uHoverMix;
        uniform float uTravelSpeed;
        uniform float uReducedMotion;

        varying float vAlong;
        varying float vSide;
        varying float vHeadPower;
        varying float vWakeFade;
        varying float vTailAlpha;
        varying float vSeed;
        varying vec3 vHeadCol;
        varying vec3 vNeckCol;
        varying vec3 vWakeCol;

        void main() {
          if (uReducedMotion > 0.5) {
            vHeadPower = 0.0;
            vWakeFade = 0.0;
            vTailAlpha = 0.0;
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }

          float cycle = fract(aSeed + uTime * aSpeed);
          float activeWindow = 0.38;
          if (cycle >= activeWindow) {
            vHeadPower = 0.0;
            vWakeFade = 0.0;
            vTailAlpha = 0.0;
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }

          float u = cycle / activeWindow;
          float speedNorm = clamp(uTravelSpeed, 0.0, 1.0);

          // Physical atmospheric ablation curve:
          // - Entry ramp -> steady incandescent flight -> terminal flare (~u=0.72) -> head quench (~u=0.84)
          // - Ionized wake lingers and dissipates softly through u=1.0
          float entry = smoothstep(0.0, 0.18, u);
          float headBurnout = 1.0 - smoothstep(0.75, 0.89, u);
          float flare = exp(-pow((u - 0.72) / 0.09, 2.0)) * 0.42;
          float flicker = 0.92 + 0.08 * sin(uTime * 22.0 + aSeed * 91.0) * sin(uTime * 13.7 + aSeed * 37.0);
          float headPower = entry * headBurnout * (1.0 + flare) * flicker;
          float wakeFade = entry * (1.0 - smoothstep(0.58, 1.0, u)) * (1.0 - uHoverMix * 0.58);

          // Head advances smoothly then coasts slightly as terminal flare vaporizes it
          float headProgress = min(u, 0.86) + max(0.0, u - 0.86) * 0.25;
          vec3 headPos = aOrigin + aDir * (headProgress * aTravel);

          // Vertex-interpolated stretching: grows smoothly on entry and elongates during high-speed travel
          float wakeGrow = smoothstep(0.0, 0.36, u);
          float intrinsicVelRatio = clamp((aSpeed - 0.044) / 0.024, 0.0, 1.0);
          float stretchMul = (1.0 + speedNorm * 1.15 + intrinsicVelRatio * 0.25);
          float curLen = aLength * (0.28 + 0.72 * wakeGrow) * stretchMul;

          // Non-linear vertex interpolation clusters resolution near the luminous coma and stretches the rear tail
          float curvedAlong = pow(aCoord.x, mix(1.18, 1.48, speedNorm));
          vec3 basePos = headPos - aDir * (curvedAlong * curLen);

          vec3 toCam = normalize(cameraPosition - basePos);
          vec3 perp = normalize(cross(aDir, toCam) + vec3(0.0001, 0.0001, 0.0));

          // Subtle aerodynamic turbulence sway along the cooling persistent train
          float drift = sin(curvedAlong * 7.5 - uTime * 1.4 + aSeed * 25.0) * 0.065 * pow(curvedAlong, 1.6);

          // Smooth vertex-interpolated width tapering from incandescent coma (0.30) to needle tip (0.03)
          float comaRadius = 0.30;
          float tipRadius = 0.03;
          float speedTighten = 1.0 - speedNorm * 0.22;
          float halfWidth = mix(comaRadius, tipRadius, pow(aCoord.x, 0.72)) * speedTighten;

          vec3 worldPos = basePos + perp * (aCoord.y * halfWidth + drift);

          // Vertex-interpolated smooth tail opacity fade reaching exact zero at trailing tip
          float tailDecay = pow(max(0.0, 1.0 - aCoord.x), 1.85);
          float tipFeather = 1.0 - smoothstep(0.76, 1.0, aCoord.x);

          vAlong = curvedAlong;
          vSide = aCoord.y;
          vHeadPower = headPower * (1.0 - uHoverMix * 0.55);
          vWakeFade = wakeFade;
          vTailAlpha = tailDecay * tipFeather;
          vSeed = aSeed;
          vHeadCol = aHeadCol;
          vNeckCol = aNeckCol;
          vWakeCol = aWakeCol;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlong;
        varying float vSide;
        varying float vHeadPower;
        varying float vWakeFade;
        varying float vTailAlpha;
        varying float vSeed;
        varying vec3 vHeadCol;
        varying vec3 vNeckCol;
        varying vec3 vWakeCol;

        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        void main() {
          if ((vWakeFade <= 0.004 && vHeadPower <= 0.004) || vTailAlpha <= 0.001) discard;

          float r2 = vSide * vSide;

          // 1. Intense incandescent meteoroid coma directly around vAlong = 0
          float headEnvelope = exp(-vAlong * 24.0) * vHeadPower;
          float headCore = exp(-r2 * 34.0) * headEnvelope * 2.2;
          float headComa = exp(-r2 * 5.5) * headEnvelope * 0.72;

          // 2. Superheated plasma neck directly behind head (0.0 .. 0.32)
          float neckDrop = exp(-vAlong * 5.8) * smoothstep(0.0, 0.035, vAlong + 0.02);
          float neckCore = exp(-r2 * mix(26.0, 12.0, vAlong)) * neckDrop * (0.45 + 0.55 * vHeadPower);

          // 3. Smoothly interpolated ionized vapor train with longitudinal density striations
          float striation = 0.82 + 0.18 * sin(vAlong * 34.0 + vSeed * 80.0);
          float vaporNoise = 0.88 + 0.12 * hash12(vec2(floor(vAlong * 90.0), vSeed * 100.0));
          float trainBeam = exp(-r2 * mix(16.0, 4.4, vAlong)) * vTailAlpha * striation * vaporNoise * vWakeFade * 0.68;

          float totalAlpha = clamp(headCore + headComa + neckCore + trainBeam, 0.0, 1.0);
          if (totalAlpha < 0.006) discard;

          // Physical thermal & spectral cooling gradient from white-hot bow shock -> plasma neck -> [OI]/amber wake
          vec3 col = mix(vHeadCol, vNeckCol, smoothstep(0.02, 0.22, vAlong));
          col = mix(col, vWakeCol, smoothstep(0.18, 0.72, vAlong));
          col = mix(col, vec3(1.0, 0.99, 0.96), clamp(headCore * 0.75, 0.0, 1.0));

          float radiance = 0.72 + headCore * 0.85 + neckCore * 0.35;
          gl_FragColor = vec4(col * radiance, totalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    this.wakeMesh = new THREE.Mesh(this.wakeGeometry, this.wakeMaterial);
    this.wakeMesh.frustumCulled = false;
    this.wakeMesh.renderOrder = 0;
    this.group.add(this.wakeMesh);

    // -----------------------------------------------------------------------
    // Layer 2: Microscopic Ablation Sparks & Ember Dust Shed Behind Coma
    // -----------------------------------------------------------------------
    const totalSparks = meteorCount * sparksPerMeteor;
    const positions = new Float32Array(totalSparks * 3);
    const origins = new Float32Array(totalSparks * 3);
    const dirs = new Float32Array(totalSparks * 3);
    const trailFracs = new Float32Array(totalSparks);
    const seeds = new Float32Array(totalSparks);
    const speeds = new Float32Array(totalSparks);
    const lengths = new Float32Array(totalSparks);
    const travels = new Float32Array(totalSparks);
    const spreads = new Float32Array(totalSparks);
    const colors = new Float32Array(totalSparks * 3);

    for (let m = 0; m < meteorCount; m++) {
      const tr = tracks[m];
      for (let t = 0; t < sparksPerMeteor; t++) {
        const idx = m * sparksPerMeteor + t;
        const frac = rng(); // scattered stochastically along the ablation wake

        positions[idx * 3] = tr.ox;
        positions[idx * 3 + 1] = tr.oy;
        positions[idx * 3 + 2] = tr.oz;

        origins[idx * 3] = tr.ox;
        origins[idx * 3 + 1] = tr.oy;
        origins[idx * 3 + 2] = tr.oz;

        dirs[idx * 3] = tr.ndx;
        dirs[idx * 3 + 1] = tr.ndy;
        dirs[idx * 3 + 2] = tr.ndz;

        trailFracs[idx] = frac;
        seeds[idx] = tr.seed;
        speeds[idx] = tr.speed;
        lengths[idx] = tr.length;
        travels[idx] = tr.travelDist;
        spreads[idx] = (rng() - 0.5) * 2.0;

        // Warm incandescent spallation embers cooling toward wake hue
        const emberCol = tr.palette.neck.clone().lerp(tr.palette.wake, frac * 0.75);
        colors[idx * 3] = emberCol.r;
        colors[idx * 3 + 1] = emberCol.g;
        colors[idx * 3 + 2] = emberCol.b;
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3));
    this.geometry.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
    this.geometry.setAttribute('aTrailFrac', new THREE.BufferAttribute(trailFracs, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    this.geometry.setAttribute('aLength', new THREE.BufferAttribute(lengths, 1));
    this.geometry.setAttribute('aTravel', new THREE.BufferAttribute(travels, 1));
    this.geometry.setAttribute('aSpread', new THREE.BufferAttribute(spreads, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHoverMix: { value: 0 },
        uTravelSpeed: { value: 0 },
        uReducedMotion: { value: 0 },
        uPixelRatio: { value: pixelRatio },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aOrigin;
        attribute vec3 aDir;
        attribute float aTrailFrac;
        attribute float aSeed;
        attribute float aSpeed;
        attribute float aLength;
        attribute float aTravel;
        attribute float aSpread;
        attribute vec3 aColor;

        uniform float uTime;
        uniform float uHoverMix;
        uniform float uTravelSpeed;
        uniform float uReducedMotion;
        uniform float uPixelRatio;

        varying float vFade;
        varying vec3 vColor;

        void main() {
          if (uReducedMotion > 0.5) {
            vFade = 0.0;
            gl_PointSize = 0.0;
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }

          float cycle = fract(aSeed + uTime * aSpeed);
          float activeWindow = 0.38;
          if (cycle >= activeWindow) {
            vFade = 0.0;
            gl_PointSize = 0.0;
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }

          float u = cycle / activeWindow;
          float speedNorm = clamp(uTravelSpeed, 0.0, 1.0);
          float entry = smoothstep(0.08, 0.28, u);
          float wakeFade = entry * (1.0 - smoothstep(0.60, 0.98, u));

          float headProgress = min(u, 0.86) + max(0.0, u - 0.86) * 0.25;
          vec3 headPos = aOrigin + aDir * (headProgress * aTravel);

          float wakeGrow = smoothstep(0.0, 0.36, u);
          float intrinsicVelRatio = clamp((aSpeed - 0.044) / 0.024, 0.0, 1.0);
          float stretchMul = 1.0 + speedNorm * 1.15 + intrinsicVelRatio * 0.25;
          float activeTrailLen = aLength * (0.28 + 0.72 * wakeGrow) * stretchMul;

          // Synchronized non-linear lag along stretched wake
          float curvedFrac = pow(aTrailFrac, mix(1.18, 1.48, speedNorm));
          float lagDist = (0.04 + curvedFrac * 0.82) * activeTrailLen;
          vec3 pos = headPos - aDir * lagDist;

          vec3 toCam = normalize(cameraPosition - pos);
          vec3 perp = normalize(cross(aDir, toCam) + vec3(0.0001, 0.0001, 0.0));
          float speedTighten = 1.0 - speedNorm * 0.22;
          pos += perp * aSpread * (0.05 + aTrailFrac * 0.28) * speedTighten;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          float dist = max(1.0, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;

          float flicker = 0.55 + 0.45 * sin(uTime * 28.0 + aTrailFrac * 75.0 + aSeed * 120.0);
          float coolFade = pow(max(0.0, 1.0 - aTrailFrac), 2.1) * (1.0 - smoothstep(0.76, 1.0, aTrailFrac));
          gl_PointSize = clamp((mix(1.5, 3.8, 1.0 - aTrailFrac) * (120.0 / dist)) * uPixelRatio, 1.1, 4.2 * uPixelRatio);

          vFade = wakeFade * coolFade * flicker * 0.56 * (1.0 - uHoverMix * 0.58);
          vColor = aColor;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vFade;
        varying vec3 vColor;

        void main() {
          if (vFade <= 0.01) discard;
          vec2 uv = gl_PointCoord - 0.5;
          float r2 = dot(uv, uv) * 4.0;
          float glow = exp(-r2 * 5.2);
          float alpha = glow * vFade;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColor * 1.15, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 0;
    this.group.add(this.points);
  }

  public setPixelRatio(pixelRatio: number): void {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  public update(
    elapsedTime: number,
    cameraPos: THREE.Vector3,
    hoverMix: number,
    reducedMotion: boolean,
    travelSpeed = 0,
  ): void {
    this.group.position.copy(cameraPos);
    const hover = reducedMotion ? 0 : hoverMix;
    const reduced = reducedMotion ? 1 : 0;
    const speed = reducedMotion ? 0 : Math.max(0, Math.min(1, travelSpeed));

    this.wakeMaterial.uniforms.uTime.value = elapsedTime;
    this.wakeMaterial.uniforms.uHoverMix.value = hover;
    this.wakeMaterial.uniforms.uTravelSpeed.value = speed;
    this.wakeMaterial.uniforms.uReducedMotion.value = reduced;

    this.material.uniforms.uTime.value = elapsedTime;
    this.material.uniforms.uHoverMix.value = hover;
    this.material.uniforms.uTravelSpeed.value = speed;
    this.material.uniforms.uReducedMotion.value = reduced;
  }

  public dispose(): void {
    this.wakeGeometry.dispose();
    this.wakeMaterial.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
