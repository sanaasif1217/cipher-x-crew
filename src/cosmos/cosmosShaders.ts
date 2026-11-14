import * as THREE from 'three';

/**
 * Custom GLSL shaders for the Watch the Sky Change — SPHEREx Galaxy Exploration Scene:
 * 1. Analytical Astronomical Star Shader (`createRealisticStarMaterial`):
 *    - Pure mathematical Airy-disk & optical PSF (no blurry bitmap circles!)
 *    - White-hot saturated stellar core transitioning into true Planckian blackbody halo
 *    - Razor-thin optical diffraction spikes ONLY on bright magnitude-1 giants or cursor touch
 *    - Infinite smooth 3D corridor flight (`uIsCorridor = 1`) + vast Milky Way dome (`uIsCorridor = 0`)
 *    - Cursor-touch flare & gentle screen-space parting + `#go` hover upward canopy clearing
 * 2. Interstellar Dust & Nebula Wisp Shader (`createGalaxyObjectMaterial`).
 * 3. Foreground Parallax Stardust Shader (`createForegroundDustMaterial`).
 * 4. Post-processing Split-RGB noise + dynamic speed-reactive vignette pass.
 */

export function createRealisticStarMaterial(params: {
  pixelRatio: number;
  isCorridor: boolean;
  fogColor: THREE.Color;
  parallaxFactor?: number;
  flowFactor?: number;
  sizeScale?: number;
  zSpan?: number;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlowZ: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uPixelRatio: { value: params.pixelRatio },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uMouseNDC: { value: new THREE.Vector2(99, 99) },
      uHoverMix: { value: 0 },
      uIsCorridor: { value: params.isCorridor ? 1.0 : 0.0 },
      uParallax: { value: params.parallaxFactor ?? (params.isCorridor ? 1.0 : 0.04) },
      uFlowScale: { value: params.flowFactor ?? (params.isCorridor ? 1.0 : 0.05) },
      uSizeScale: { value: params.sizeScale ?? 1.0 },
      uZSpan: { value: params.zSpan ?? 210.0 },
      uReducedMotion: { value: 0 },
      uFogColor: { value: params.fogColor },
    },
    vertexShader: /* glsl */ `
      attribute float aMagnitude;
      attribute float aSeed;
      attribute float aStarId;
      attribute vec3 aColor;
      attribute vec3 aDisperse;

      uniform float uTime;
      uniform float uFlowZ;
      uniform vec3 uCamPos;
      uniform float uPixelRatio;
      uniform vec2 uResolution;
      uniform vec2 uMouseNDC;
      uniform float uHoverMix;
      uniform float uIsCorridor;
      uniform float uParallax;
      uniform float uFlowScale;
      uniform float uSizeScale;
      uniform float uZSpan;
      uniform float uReducedMotion;

      varying vec3 vColor;
      varying float vMag;
      varying float vStarShine;
      varying float vAlpha;
      varying float vSpikeAngle;
      varying float vTwinkle;

      void main() {
        vec3 pos = position;
        float halfSpan = uZSpan * 0.5;

        if (uIsCorridor > 0.5) {
          // Layered depth parallax: distant layers travel slower than closer layers as camera scrolls
          float zTravel = uFlowZ * uFlowScale - uCamPos.z * uParallax;
          float zRel = mod(pos.z + zTravel + halfSpan, uZSpan) - halfSpan;
          pos.z = uCamPos.z + zRel;
          pos.xy += uCamPos.xy * (1.0 - clamp(uParallax, 0.0, 1.25));

          // Upward dispersion during #go hover clearing
          float swirl = uTime * 0.45 + aSeed * 12.56;
          vec3 liftOffset = vec3(
            aDisperse.x * 5.0 + sin(swirl) * 0.65,
            (2.2 + abs(aDisperse.y) * 8.2) + sin(swirl * 0.65) * 0.4,
            aDisperse.z * 5.0 + cos(swirl) * 0.65
          );
          pos += liftOffset * uHoverMix;
        } else {
          // Deep celestial Milky Way dome tracks camera with subtle residual parallax
          pos += uCamPos * (1.0 - uParallax);
        }

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        float dist = max(0.8, -mvPosition.z);

        vec4 clipPos = projectionMatrix * mvPosition;
        vec2 ndc = clipPos.xy / max(0.0001, clipPos.w);

        // Screen-space cursor proximity flare
        float aspect = uResolution.x / max(1.0, uResolution.y);
        vec2 diff = ndc - uMouseNDC;
        vec2 aspectDiff = vec2(diff.x * aspect, diff.y);
        float mouseDist = length(aspectDiff);

        float shine = 1.0 - smoothstep(0.0, 0.21, mouseDist);
        vStarShine = pow(shine, 1.45);

        // Subtle optical screen-space parting around cursor + center clearing on #go hover
        float pushInfluence = (1.0 - smoothstep(0.0, 0.24, mouseDist)) * uIsCorridor * clamp(uParallax, 0.35, 1.35);
        vec2 pushDir = mouseDist > 0.0001 ? normalize(aspectDiff) : vec2(0.0, 1.0);
        vec2 ndcPush = vec2(pushDir.x / aspect, pushDir.y) * pushInfluence * 0.065;
        ndcPush.y += uHoverMix * mix(0.24, 0.42, uIsCorridor);

        clipPos.xy += ndcPush * clipPos.w;
        gl_Position = clipPos;

        // Physical optical sizing: tiny razor-sharp background specks + larger quads ONLY
        // for bright giants/hovered stars so diffraction spikes never clip
        float sizeMul = mix(2.2, 165.0 / dist, uIsCorridor) * uSizeScale;
        float magCurve = mix(0.85, 5.2, pow(aMagnitude, 1.55));
        float hoverBoost = 1.0 + vStarShine * 2.1;
        float quadSize = sizeMul * magCurve * hoverBoost * uPixelRatio;

        // Faint stars stay ultra-crisp (~1.8px..3.5px), giants have ample canvas for airy halo & spikes
        float minPx = mix(1.3, 1.7, uIsCorridor) * uPixelRatio;
        float maxPx = mix(11.0, 32.0, max(aMagnitude, vStarShine)) * uPixelRatio;
        gl_PointSize = clamp(quadSize, minPx, maxPx);

        vColor = aColor;
        vMag = aMagnitude;
        vSpikeAngle = aSeed * 0.45 + vStarShine * 0.35;

        // Randomized high-frequency brightness oscillation keyed off each star's unique ID + elapsed time
        float idHash1 = fract(sin(aStarId * 12.9898 + 78.233) * 43758.5453);
        float idHash2 = fract(sin(aStarId * 93.9898 + 67.345) * 24634.6345);
        float idHash3 = fract(sin(aStarId * 41.231 + 19.871) * 15731.7431);
        float highFreq = 8.5 + idHash1 * 13.5;
        float modFreq = 2.4 + idHash2 * 4.2;
        float phaseA = idHash2 * 6.2831853 + aStarId * 0.713;
        float phaseB = idHash3 * 6.2831853;
        float fastWave = sin(uTime * highFreq + phaseA);
        float envelopeWave = 0.55 + 0.45 * sin(uTime * modFreq + phaseB);
        float twinkleAmp = mix(0.26, 0.20, uIsCorridor) * (1.0 - aMagnitude * 0.28);
        vTwinkle = mix(1.0 + fastWave * envelopeWave * twinkleAmp, 1.0, uReducedMotion);

        if (uIsCorridor > 0.5) {
          float nearFade = smoothstep(1.0, 4.2, dist);
          float farFade = 1.0 - smoothstep(halfSpan * 0.62, halfSpan * 0.96, dist);
          vAlpha = nearFade * farFade;
        } else {
          // Deep Milky Way dome stays crisp and subtly parts during hover clear
          vAlpha = 1.0 - uHoverMix * 0.28;
        }
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vMag;
      varying float vStarShine;
      varying float vAlpha;
      varying float vSpikeAngle;
      varying float vTwinkle;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float r = length(uv) * 2.0;
        float edgeMask = smoothstep(1.0, 0.76, r);
        if (edgeMask <= 0.001) discard;

        // Pure analytical astronomical Point Spread Function (Airy core + optical aura)
        float coreTightness = mix(16.0, 72.0, clamp(max(vMag, vStarShine), 0.0, 1.0));
        float core = exp(-r * r * coreTightness);
        float halo = exp(-r * r * mix(6.5, 16.0, vMag)) * (0.24 + vMag * 0.38);
        float corona = exp(-r * 4.2) * (max(0.0, vMag - 0.68) * 0.65 + vStarShine * 0.72);

        // Ultra-fine optical diffraction spikes ONLY on bright magnitude giants & hovered stars
        float ca = cos(vSpikeAngle);
        float sa = sin(vSpikeAngle);
        vec2 rotUv = vec2(uv.x * ca - uv.y * sa, uv.x * sa + uv.y * ca);
        float spikeMask = smoothstep(0.8, 1.0, vMag) * 0.45 + vStarShine * 1.1;
        float spikeA = exp(-abs(rotUv.x) * 86.0) * exp(-abs(rotUv.y) * 7.5);
        float spikeB = exp(-abs(rotUv.y) * 86.0) * exp(-abs(rotUv.x) * 7.5);
        float spikes = (spikeA + spikeB) * edgeMask * spikeMask;

        // Resting intensity follows realistic Pogson magnitude curve + non-synchronized twinkle; cursor touch flares vividly
        float lum = (0.36 + vMag * 0.85) * vTwinkle + vStarShine * 1.45;
        float alpha = clamp((core * 1.15 + halo + corona + spikes) * edgeMask * lum, 0.0, 1.0) * vAlpha;
        if (alpha < 0.01) discard;

        // Authentic blackbody color: outer halo retains spectral hue while intense center saturates toward pure white
        vec3 whiteHot = vec3(1.0, 0.99, 0.97);
        vec3 spectralCore = mix(vColor, whiteHot, clamp(core * (0.62 + vMag * 0.32 + vStarShine * 0.38), 0.0, 1.0));
        vec3 finalCol = spectralCore * (0.88 + core * 0.75 + vStarShine * 0.95) * (0.92 + 0.08 * vTwinkle);

        gl_FragColor = vec4(finalCol, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function createGalaxyObjectMaterial(params: {
  atlas: THREE.Texture;
  pixelRatio: number;
  isStar: boolean;
  bloomNear: number;
  bloomFar: number;
  fogColor: THREE.Color;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: params.atlas },
      uTime: { value: 0 },
      uFlowZ: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uPixelRatio: { value: params.pixelRatio },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uMouseNDC: { value: new THREE.Vector2(99, 99) },
      uHoverMix: { value: 0 },
      uIsStar: { value: params.isStar ? 1.0 : 0.0 },
      uBloomNear: { value: params.bloomNear },
      uBloomFar: { value: params.bloomFar },
      uFogColor: { value: params.fogColor },
    },
    vertexShader: /* glsl */ `
      attribute float aScale;
      attribute float aTile;
      attribute float aSeed;
      attribute float aDepth;
      attribute vec3 aColor;
      attribute vec3 aDisperse;

      uniform float uTime;
      uniform float uFlowZ;
      uniform vec3 uCamPos;
      uniform float uPixelRatio;
      uniform vec2 uResolution;
      uniform vec2 uMouseNDC;
      uniform float uHoverMix;
      uniform float uIsStar;
      uniform float uBloomNear;
      uniform float uBloomFar;

      varying vec2 vTileOffset;
      varying vec3 vColor;
      varying float vFogFactor;
      varying float vAlpha;
      varying float vRotation;

      void main() {
        vec3 pos = position;

        // Expanded 320-unit z-depth volume with depth-stratified parallax (0.24x far -> 1.72x near)
        float zSpan = 320.0;
        float halfSpan = zSpan * 0.5;
        float depthNorm = clamp(aDepth, 0.0, 1.0);
        float parallax = mix(0.24, 1.72, depthNorm);
        float flowScale = mix(0.32, 1.48, depthNorm);
        float zTravel = uFlowZ * flowScale - uCamPos.z * parallax;
        float zRel = mod(pos.z + zTravel + halfSpan, zSpan) - halfSpan;
        pos.z = uCamPos.z + zRel;
        pos.xy += uCamPos.xy * (1.0 - clamp(parallax, 0.0, 1.35));

        float driftPhase = uTime * (0.14 + aSeed * 0.1) + aSeed * 6.2831;
        pos.x += sin(driftPhase) * mix(0.18, 0.09, depthNorm);
        pos.y += cos(driftPhase * 0.8) * mix(0.14, 0.07, depthNorm);

        float swirl = uTime * 0.45 + aSeed * 12.56;
        vec3 liftOffset = vec3(
          aDisperse.x * 5.2 + sin(swirl) * 0.75,
          (2.2 + abs(aDisperse.y) * 8.5) + sin(swirl * 0.7) * 0.45,
          aDisperse.z * 5.2 + cos(swirl) * 0.75
        );
        pos += liftOffset * uHoverMix;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        float dist = max(0.7, -mvPosition.z);

        float approachBloom = 1.0 - smoothstep(uBloomNear, uBloomFar, dist);
        float activeScale = mix(0.45, 1.0, approachBloom) * mix(1.0, 0.72, uHoverMix);

        vec4 clipPos = projectionMatrix * mvPosition;
        vec2 ndc = clipPos.xy / max(0.0001, clipPos.w);
        float aspect = uResolution.x / max(1.0, uResolution.y);
        vec2 diff = ndc - uMouseNDC;
        vec2 aspectDiff = vec2(diff.x * aspect, diff.y);
        float mouseDist = length(aspectDiff);

        float pushInfluence = (1.0 - smoothstep(0.0, 0.26, mouseDist)) * mix(0.35, 1.35, depthNorm);
        vec2 pushDir = mouseDist > 0.0001 ? normalize(aspectDiff) : vec2(0.0, 1.0);
        vec2 ndcPush = vec2(pushDir.x / aspect, pushDir.y) * pushInfluence * 0.06;
        ndcPush.y += uHoverMix * 0.42;

        clipPos.xy += ndcPush * clipPos.w;
        gl_Position = clipPos;

        float basePointSize = aScale * activeScale * (380.0 / dist) * uPixelRatio;
        gl_PointSize = clamp(basePointSize, 4.0, 168.0 * uPixelRatio);

        float col = mod(aTile, 2.0);
        float row = floor(aTile * 0.5);
        vTileOffset = vec2(col * 0.5, row * 0.5);

        vColor = aColor;
        vRotation = aSeed * 6.2831 + uTime * (0.025 + aSeed * 0.03);

        // Deep nebula clouds remain visible across distant z-depths; foreground wisps dissolve smoothly before lens
        float nearFade = smoothstep(2.4, mix(14.0, 7.5, depthNorm), dist);
        float farFade = 1.0 - smoothstep(mix(105.0, 62.0, depthNorm), mix(154.0, 96.0, depthNorm), dist);
        vAlpha = nearFade * farFade * mix(0.19, 0.26, depthNorm);
        vFogFactor = 1.0 - exp(-pow(dist * mix(0.0085, 0.012, depthNorm), 2.0));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform vec3 uFogColor;

      varying vec2 vTileOffset;
      varying vec3 vColor;
      varying float vFogFactor;
      varying float vAlpha;
      varying float vRotation;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float c = cos(vRotation);
        float s = sin(vRotation);
        vec2 rotUv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
        float edgeMask = smoothstep(0.5, 0.28, length(uv));

        vec2 atlasUv = vTileOffset + clamp(rotUv, 0.01, 0.99) * 0.5;
        vec4 texel = texture2D(uAtlas, atlasUv);
        float alpha = texel.a * edgeMask * vAlpha;
        if (alpha < 0.008) discard;

        vec3 litCol = texel.rgb * vColor * (0.76 + texel.a * 0.34);
        vec3 finalCol = mix(litCol, uFogColor, clamp(vFogFactor * 0.72, 0.0, 1.0));
        gl_FragColor = vec4(finalCol, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Foreground parallax stardust shader streaming slightly faster past the camera.
 */
export function createForegroundDustMaterial(params: {
  dustTex: THREE.Texture;
  pixelRatio: number;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: params.dustTex },
      uFlowZ: { value: 0 },
      uCamZ: { value: 0 },
      uHoverMix: { value: 0 },
      uPixelRatio: { value: params.pixelRatio },
    },
    vertexShader: /* glsl */ `
      uniform float uFlowZ;
      uniform float uCamZ;
      uniform float uHoverMix;
      uniform float uPixelRatio;

      varying float vAlpha;

      void main() {
        vec3 pos = position;
        float zSpan = 64.0;
        float zRel = mod((pos.z + uFlowZ * 1.35) - uCamZ + 48.0, zSpan) - 54.0;
        pos.z = uCamZ + zRel;
        pos.y += uHoverMix * 4.5;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        float dist = max(0.8, -mvPosition.z);

        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp((78.0 / dist) * uPixelRatio, 1.2, 8.5 * uPixelRatio);

        float nearFade = smoothstep(1.0, 3.6, dist);
        float farFade = 1.0 - smoothstep(22.0, 44.0, dist);
        vAlpha = nearFade * farFade * 0.42 * (1.0 - uHoverMix * 0.45);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying float vAlpha;

      void main() {
        vec4 texel = texture2D(uMap, gl_PointCoord);
        float alpha = texel.a * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vec3(0.92, 0.94, 0.98), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Post-processing optical Chromatic Aberration pass using 5-band radial spectral
 * dispersion. Keeps the center focal zone razor-sharp while dispersing peripheral
 * starlight smoothly as movement speed and warp intensity climb.
 */
export const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uAspect;
    varying vec2 vUv;

    void main() {
      if (uIntensity <= 0.0005) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      vec2 centered = vUv - 0.5;
      vec2 aspectVec = vec2(centered.x * uAspect, centered.y);
      float radialDist = length(aspectVec);

      // Keep center focal zone crisp; ramp dispersion quadratically toward outer lens edge
      float falloff = smoothstep(0.08, 0.96, radialDist);
      float strength = uIntensity * falloff * falloff;
      vec2 dir = radialDist > 0.0001 ? centered / max(0.0001, length(centered)) : vec2(0.0);
      vec2 maxOffset = dir * strength * 0.015;

      // Continuous 5-band spectral integration prevents harsh RGB dot splitting on pinpoints
      vec3 accum = vec3(0.0);
      vec3 weights = vec3(0.0);
      for (int i = 0; i < 5; i++) {
        float t = float(i) / 4.0;
        float shift = (t - 0.5) * 2.0;
        vec2 sampleUv = clamp(vUv + maxOffset * shift, vec2(0.001), vec2(0.999));
        vec3 tex = texture2D(tDiffuse, sampleUv).rgb;

        vec3 w = vec3(
          smoothstep(0.35, 1.0, t),
          max(0.0, 1.0 - abs(t - 0.5) * 2.0) * 1.15,
          1.0 - smoothstep(0.0, 0.65, t)
        );
        accum += tex * w;
        weights += w;
      }

      gl_FragColor = vec4(accum / max(weights, vec3(0.0001)), 1.0);
    }
  `,
};

/**
 * Post-processing pass applying quiet cosmic film grain and a dynamic vignette
 * that tightens with movement speed & hover transition.
 */
export const SplitRgbVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeedIntensity: { value: 0 },
    uVignetteStrength: { value: 0.44 },
    uHoverMix: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uSpeedIntensity;
    uniform float uVignetteStrength;
    uniform float uHoverMix;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3  = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center);

      vec3 col = texture2D(tDiffuse, vUv).rgb;

      float grain = (hash12(vUv * 1200.0 + fract(uTime * 11.3) * 100.0) - 0.5) * 0.02;
      col += grain;

      float vigRadius = mix(0.88, 0.65, clamp(uSpeedIntensity * 0.8 + uHoverMix * 0.24, 0.0, 1.0));
      float vig = smoothstep(vigRadius, 0.22, dist);
      col *= mix(1.0 - uVignetteStrength, 1.0, vig);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

