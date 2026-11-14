import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {
  computeBloomParams,
  computeChromaticIntensity,
  computeLandmarkVisibility,
  computeMilestoneAudioState,
  computeVignetteStrength,
  computeWarpIntensity,
  createRng,
  damp,
  LANDMARK_STOPS,
  smoothstep,
  STAR_PARALLAX_LAYERS,
} from './cosmosMath';
import {
  createCosmosClusterAtlasTexture,
  createDustTexture,
  createLightRayTexture,
  createNebulaWispTexture,
  createStarAtlasTexture,
} from './proceduralTextures';
import {
  ChromaticAberrationShader,
  createForegroundDustMaterial,
  createGalaxyObjectMaterial,
  createRealisticStarMaterial,
  SplitRgbVignetteShader,
} from './cosmosShaders';
import {
  createDestinationLandmarks,
  createPointerCometTrail,
  createWarpStreakSystem,
  type LandmarkBundle,
} from './landmarks';
import { ParticleSystem } from './ParticleSystem';
import type { AudioStoreApi } from './audioEngine';

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class CosmosEngine {
  private container: HTMLElement;
  private canvasHost: HTMLElement;
  private onLoaded: () => void;
  private onIntroDone: () => void;
  private audioStore: (() => AudioStoreApi) | null;
  private onVignetteChange?: (strength: number) => void;

  private isSoftwareGl: boolean;
  private reducedMotionQuery: MediaQueryList;
  private reducedMotion: boolean;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private chromaticPass: ShaderPass | null = null;
  private splitRgbPass: ShaderPass | null = null;

  private deepSkyMaterial!: THREE.ShaderMaterial;
  private starLayerMaterials: THREE.ShaderMaterial[] = [];
  private nebulaMaterial!: THREE.ShaderMaterial;
  private dustMaterial!: THREE.ShaderMaterial;
  private lightRays: Array<{ sprite: THREE.Sprite; baseOpacity: number; phase: number }> = [];
  private coreGlowSprites: Array<{ sprite: THREE.Sprite; baseOpacity: number }> = [];

  private landmarks!: LandmarkBundle;
  private cometTrail!: ReturnType<typeof createPointerCometTrail>;
  private warpSystem!: ReturnType<typeof createWarpStreakSystem>;
  private meteorParticles!: ParticleSystem;

  private curve!: THREE.CatmullRomCurve3;
  private targetScrollProgress = 0;
  private currentScrollProgress = 0;
  private scrollVelocity = 0;
  private flowZ = 0;
  private manualWarp = 0;
  private warpTimer = 0;
  private activeLandmarkIndex = -1;

  private mouseNDC = new THREE.Vector2(99, 99);
  private targetMouseNDC = new THREE.Vector2(99, 99);
  private mouseTilt = new THREE.Vector2(0, 0);
  private targetMouseTilt = new THREE.Vector2(0, 0);

  private hoverTarget = 0;
  private hoverMix = 0;
  private introProgress = 0;
  private introReported = false;
  private disposed = false;

  private rafId = 0;
  private timeoutId = 0;
  private lastTime = performance.now();
  private elapsedTime = 0;

  // Scratch vectors to avoid per-frame allocations
  private readonly _camPos = new THREE.Vector3();
  private readonly _lookPos = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _forward = new THREE.Vector3();

  private disposables: Array<{ dispose: () => void }> = [];

  constructor(
    container: HTMLElement,
    onLoaded: () => void,
    onIntroDone: () => void,
    options?: {
      audioStore?: () => AudioStoreApi;
      instantIntro?: boolean;
      onVignetteChange?: (strength: number) => void;
    },
  ) {
    this.container = container;
    this.canvasHost =
      (container.querySelector('.js-canvas-container') as HTMLElement) || container;
    this.onLoaded = onLoaded;
    this.onIntroDone = onIntroDone;
    this.audioStore = options?.audioStore ?? null;
    this.onVignetteChange = options?.onVignetteChange;
    if (options?.instantIntro) {
      this.introProgress = 1;
    }

    this.isSoftwareGl = detectSoftwareWebGL();
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.reducedMotionQuery.matches;

    this.initScene();
    this.bindEvents();
    this.startLoop();
  }

  private initScene(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const pixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setClearColor(0x020309, 1);

    this.canvasHost.innerHTML = '';
    this.canvasHost.appendChild(this.renderer.domElement);

    const fogColor = new THREE.Color(0x010207);
    this.scene = new THREE.Scene();
    this.scene.background = fogColor;
    this.scene.fog = new THREE.FogExp2(0x010207, 0.0085);

    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 420);
    this.scene.add(this.camera);

    // Lighting for 3D landmarks (Ringed Planet & Nebula relief)
    const hemi = new THREE.HemisphereLight(0x98b8ff, 0x10182a, 0.9);
    const sunKey = new THREE.DirectionalLight(0xfff1dc, 1.85);
    sunKey.position.set(28, 18, 22);
    this.scene.add(hemi, sunKey);

    // Open forward cosmic flight spline spanning 188 world units (scroll 0 -> 1)
    const pathPoints = [
      new THREE.Vector3(0, 0.6, 0),       // 0.00 Hero arrival
      new THREE.Vector3(-4, 1.2, -30),    // approaching Work Nebula
      new THREE.Vector3(-2, 0.8, -54),    // 0.28 Work (Nebula on left)
      new THREE.Vector3(5, -0.4, -82),    // approaching About Ringed Planet
      new THREE.Vector3(4, 0.5, -104),    // 0.54 About (Ringed Planet on right)
      new THREE.Vector3(-3, 1.4, -130),   // approaching Journal Spiral Galaxy
      new THREE.Vector3(-2, 0.9, -150),   // 0.78 Journal (Spiral Galaxy ahead-left)
      new THREE.Vector3(0, 0.2, -184),    // 0.96 Contact Beacon
      new THREE.Vector3(0, 0.0, -196),    // 1.00 End horizon
    ];
    this.curve = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.5);

    // Textures
    const starAtlas = createStarAtlasTexture();
    const clusterAtlas = createCosmosClusterAtlasTexture();
    const dustTex = createDustTexture();
    const nebulaTex = createNebulaWispTexture();
    const rayTex = createLightRayTexture();
    this.disposables.push(starAtlas, clusterAtlas, dustTex, nebulaTex, rayTex);

    // Starfield, spiral nebula dust, cosmic atmosphere, landmarks, comet trail, warp streaks, distant meteorites
    this.buildGalaxyLayers(starAtlas, clusterAtlas, pixelRatio, fogColor);
    this.buildCosmicAtmosphere(dustTex, nebulaTex, rayTex, pixelRatio);

    this.landmarks = createDestinationLandmarks(starAtlas, nebulaTex, clusterAtlas);
    this.landmarks.nebulaGroup.position.set(-11.5, 1.0, -56);
    this.landmarks.planetGroup.position.set(13.5, 0.6, -106);
    this.landmarks.galaxyGroup.position.set(-11.8, 1.4, -153);
    this.landmarks.setNebulaOpacity(0);
    this.landmarks.setPlanetOpacity(0);
    this.landmarks.setGalaxyOpacity(0);
    this.scene.add(
      this.landmarks.nebulaGroup,
      this.landmarks.planetGroup,
      this.landmarks.galaxyGroup,
    );
    this.disposables.push(...this.landmarks.disposables);

    this.cometTrail = createPointerCometTrail(pixelRatio);
    this.scene.add(this.cometTrail.points);
    this.disposables.push(this.cometTrail);

    this.warpSystem = createWarpStreakSystem();
    this.camera.add(this.warpSystem.lines);
    this.disposables.push(this.warpSystem);

    this.meteorParticles = new ParticleSystem({
      meteorCount: 6,
      particlesPerMeteor: 24,
      pixelRatio,
    });
    this.scene.add(this.meteorParticles.group);
    this.disposables.push(this.meteorParticles);

    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.setSize(width, height);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      const initialBloom = computeBloomParams(0, 0, 0, this.reducedMotion);
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        initialBloom.strength,
        initialBloom.radius,
        initialBloom.threshold,
      );
      this.composer.addPass(this.bloomPass);

      this.chromaticPass = new ShaderPass(ChromaticAberrationShader);
      this.chromaticPass.uniforms.uAspect.value = width / Math.max(1, height);
      this.composer.addPass(this.chromaticPass);

      this.splitRgbPass = new ShaderPass(SplitRgbVignetteShader);
      this.composer.addPass(this.splitRgbPass);

      this.renderer.compile(this.scene, this.camera);
    }

    this.updateCameraTransform(0);

    requestAnimationFrame(() => {
      if (!this.disposed) this.onLoaded();
    });
  }

  private buildGalaxyLayers(
    _starAtlas: THREE.Texture,
    clusterAtlas: THREE.Texture,
    pixelRatio: number,
    fogColor: THREE.Color,
  ): void {
    const rng = createRng(90210);

    // Astronomical Planckian blackbody stellar colors weighted by galactic abundance:
    // O/B blue-white, A pure white, F/G solar ivory, K warm amber-gold, M soft orange-red
    const spectralPalette = [
      { color: new THREE.Color('#9bb8ff'), weight: 0.08 }, // O/B hot blue-white
      { color: new THREE.Color('#cfe0ff'), weight: 0.16 }, // B/A luminous white-blue
      { color: new THREE.Color('#f7f5f2'), weight: 0.28 }, // A/F crisp pure white
      { color: new THREE.Color('#fff2dc'), weight: 0.24 }, // F/G solar cream
      { color: new THREE.Color('#ffd4a3'), weight: 0.15 }, // K amber giant
      { color: new THREE.Color('#ffba8c'), weight: 0.09 }, // M warm red-orange
    ];
    const pickSpectral = (): THREE.Color => {
      let r = rng();
      for (let k = 0; k < spectralPalette.length; k++) {
        r -= spectralPalette[k].weight;
        if (r <= 0) return spectralPalette[k].color;
      }
      return spectralPalette[2].color;
    };

    // Layer 0: Deep celestial Milky Way sky (vast backdrop at r = 160..228, slowest parallax = 0.04)
    const deepLayer = STAR_PARALLAX_LAYERS[0];
    const deepCount = deepLayer.count;
    const dPos = new Float32Array(deepCount * 3);
    const dMag = new Float32Array(deepCount);
    const dSeed = new Float32Array(deepCount);
    const dStarId = new Float32Array(deepCount);
    const dCol = new Float32Array(deepCount * 3);
    const dDisp = new Float32Array(deepCount * 3);

    const tiltSin = Math.sin(0.42);
    const tiltCos = Math.cos(0.42);

    for (let i = 0; i < deepCount; i++) {
      const r = 160 + rng() * 68;
      const lon = rng() * Math.PI * 2;
      let lat: number;
      const inBand = i < deepCount * 0.62;
      if (inBand) {
        // Concentrates dense Milky Way unresolved starlight along tilted galactic plane
        const g1 = (rng() + rng() + rng()) / 3 - 0.5;
        lat = g1 * 0.44;
      } else {
        lat = Math.asin(2 * rng() - 1);
      }

      const cosLat = Math.cos(lat);
      const gx = r * cosLat * Math.cos(lon);
      const gy0 = r * Math.sin(lat);
      const gz0 = r * cosLat * Math.sin(lon);

      // Tilt galactic plane diagonally across the viewport
      const gy = gy0 * tiltCos - gz0 * tiltSin;
      const gz = gy0 * tiltSin + gz0 * tiltCos;

      dPos[i * 3] = gx;
      dPos[i * 3 + 1] = gy;
      dPos[i * 3 + 2] = gz;

      // Pogson power-law magnitude: mostly delicate faint pinpoints, rare bright anchors
      dMag[i] = inBand ? Math.pow(rng(), 4.2) * 0.85 : Math.pow(rng(), 3.6);
      dSeed[i] = rng();
      dStarId[i] = i + 1;

      const col = pickSpectral();
      const tint = 0.82 + rng() * 0.3;
      dCol[i * 3] = col.r * tint;
      dCol[i * 3 + 1] = col.g * tint;
      dCol[i * 3 + 2] = col.b * tint;

      dDisp[i * 3] = 0;
      dDisp[i * 3 + 1] = 0.5;
      dDisp[i * 3 + 2] = 0;
    }

    const deepGeo = new THREE.BufferGeometry();
    deepGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    deepGeo.setAttribute('aMagnitude', new THREE.BufferAttribute(dMag, 1));
    deepGeo.setAttribute('aSeed', new THREE.BufferAttribute(dSeed, 1));
    deepGeo.setAttribute('aStarId', new THREE.BufferAttribute(dStarId, 1));
    deepGeo.setAttribute('aColor', new THREE.BufferAttribute(dCol, 3));
    deepGeo.setAttribute('aDisperse', new THREE.BufferAttribute(dDisp, 3));

    this.deepSkyMaterial = createRealisticStarMaterial({
      pixelRatio,
      isCorridor: false,
      fogColor,
      parallaxFactor: deepLayer.parallaxFactor,
      flowFactor: deepLayer.flowFactor,
      sizeScale: deepLayer.sizeScale,
      zSpan: deepLayer.zSpan,
    });
    const deepSkyPoints = new THREE.Points(deepGeo, this.deepSkyMaterial);
    deepSkyPoints.frustumCulled = false;
    deepSkyPoints.renderOrder = 0;
    this.scene.add(deepSkyPoints);
    this.disposables.push(deepGeo, this.deepSkyMaterial);

    // Layers 1..3: Stratified 3D Parallax Corridor Stars (far -> mid -> near)
    // Distant strata move significantly slower than closer strata as user scrolls
    let nextStarId = deepCount + 1;
    for (let layerIdx = 1; layerIdx < STAR_PARALLAX_LAYERS.length; layerIdx++) {
      const layer = STAR_PARALLAX_LAYERS[layerIdx];
      const count = layer.count;
      const sPos = new Float32Array(count * 3);
      const sMag = new Float32Array(count);
      const sSeed = new Float32Array(count);
      const sStarId = new Float32Array(count);
      const sColor = new Float32Array(count * 3);
      const sDisperse = new Float32Array(count * 3);

      const minRadius = layer.id === 'far' ? 18.0 : layer.id === 'mid' ? 5.5 : 2.0;
      const maxRadius = layer.id === 'far' ? 74.0 : layer.id === 'mid' ? 46.0 : 28.0;

      for (let i = 0; i < count; i++) {
        const angle = rng() * Math.PI * 2;
        const radius = minRadius + Math.pow(rng(), 0.78) * (maxRadius - minRadius);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * 0.72;
        const z = (rng() - 0.5) * layer.zSpan;

        sPos[i * 3] = x;
        sPos[i * 3 + 1] = y;
        sPos[i * 3 + 2] = z;

        const magExp = layer.id === 'far' ? 3.8 : layer.id === 'mid' ? 3.2 : 2.55;
        sMag[i] = Math.pow(rng(), magExp);
        sSeed[i] = rng();
        sStarId[i] = nextStarId++;

        const col = pickSpectral();
        const tint = (layer.id === 'far' ? 0.76 : 0.86) + rng() * 0.28;
        sColor[i * 3] = col.r * tint;
        sColor[i * 3 + 1] = col.g * tint;
        sColor[i * 3 + 2] = col.b * tint;

        const phi = rng() * Math.PI * 2;
        const rad = 0.4 + rng() * 0.9;
        sDisperse[i * 3] = Math.cos(phi) * rad;
        sDisperse[i * 3 + 1] = 0.35 + rng() * 0.95;
        sDisperse[i * 3 + 2] = Math.sin(phi) * rad;
      }

      const layerGeo = new THREE.BufferGeometry();
      layerGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
      layerGeo.setAttribute('aMagnitude', new THREE.BufferAttribute(sMag, 1));
      layerGeo.setAttribute('aSeed', new THREE.BufferAttribute(sSeed, 1));
      layerGeo.setAttribute('aStarId', new THREE.BufferAttribute(sStarId, 1));
      layerGeo.setAttribute('aColor', new THREE.BufferAttribute(sColor, 3));
      layerGeo.setAttribute('aDisperse', new THREE.BufferAttribute(sDisperse, 3));

      const layerMat = createRealisticStarMaterial({
        pixelRatio,
        isCorridor: true,
        fogColor,
        parallaxFactor: layer.parallaxFactor,
        flowFactor: layer.flowFactor,
        sizeScale: layer.sizeScale,
        zSpan: layer.zSpan,
      });

      const layerPoints = new THREE.Points(layerGeo, layerMat);
      layerPoints.frustumCulled = false;
      layerPoints.renderOrder = 1 + layerIdx;
      this.scene.add(layerPoints);
      this.starLayerMaterials.push(layerMat);
      this.disposables.push(layerGeo, layerMat);
    }

    // 2,400 cosmic dust & mini-cluster wisps distributed across an expanded 320-unit z-depth
    // with per-particle depth stratification for pronounced scroll & drift parallax
    const clusterCount = 2400;
    const cPos = new Float32Array(clusterCount * 3);
    const cScale = new Float32Array(clusterCount);
    const cTile = new Float32Array(clusterCount);
    const cSeed = new Float32Array(clusterCount);
    const cDepth = new Float32Array(clusterCount);
    const cColor = new Float32Array(clusterCount * 3);
    const cDisperse = new Float32Array(clusterCount * 3);

    const nebulaPalette = [
      new THREE.Color('#5a78cc'),
      new THREE.Color('#7a5eb8'),
      new THREE.Color('#4a8fa8'),
      new THREE.Color('#b88964'),
    ];

    for (let i = 0; i < clusterCount; i++) {
      // Depth factor: 0 = deep background nebula veil, 1 = close foreground cosmic wisp
      const depthNorm = rng();
      const angle = rng() * Math.PI * 2;
      const minR = 2.8 + (1 - depthNorm) * 7.5;
      const maxR = 24.0 + (1 - depthNorm) * 32.0;
      const r = minR + Math.pow(rng(), 0.85) * (maxR - minR);

      cPos[i * 3] = Math.cos(angle) * r;
      cPos[i * 3 + 1] = Math.sin(angle) * r * 0.68;
      cPos[i * 3 + 2] = (rng() - 0.5) * 320.0;

      cScale[i] = (1.5 + rng() * 2.5) * (0.85 + (1 - depthNorm) * 0.75);
      cTile[i] = Math.floor(rng() * 4);
      cSeed[i] = rng();
      cDepth[i] = depthNorm;

      const col = nebulaPalette[Math.floor(rng() * nebulaPalette.length)];
      const shade = 0.62 + rng() * 0.4;
      cColor[i * 3] = col.r * shade;
      cColor[i * 3 + 1] = col.g * shade;
      cColor[i * 3 + 2] = col.b * shade;

      const a2 = rng() * Math.PI * 2;
      cDisperse[i * 3] = Math.cos(a2) * 0.55;
      cDisperse[i * 3 + 1] = 0.3 + rng() * 0.65;
      cDisperse[i * 3 + 2] = Math.sin(a2) * 0.55;
    }

    const clusterGeo = new THREE.BufferGeometry();
    clusterGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
    clusterGeo.setAttribute('aScale', new THREE.BufferAttribute(cScale, 1));
    clusterGeo.setAttribute('aTile', new THREE.BufferAttribute(cTile, 1));
    clusterGeo.setAttribute('aSeed', new THREE.BufferAttribute(cSeed, 1));
    clusterGeo.setAttribute('aDepth', new THREE.BufferAttribute(cDepth, 1));
    clusterGeo.setAttribute('aColor', new THREE.BufferAttribute(cColor, 3));
    clusterGeo.setAttribute('aDisperse', new THREE.BufferAttribute(cDisperse, 3));

    this.nebulaMaterial = createGalaxyObjectMaterial({
      atlas: clusterAtlas,
      pixelRatio,
      isStar: false,
      bloomNear: 10.0,
      bloomFar: 64.0,
      fogColor,
    });

    const clusterPoints = new THREE.Points(clusterGeo, this.nebulaMaterial);
    clusterPoints.frustumCulled = false;
    clusterPoints.renderOrder = 1;
    this.scene.add(clusterPoints);
    this.disposables.push(clusterGeo, this.nebulaMaterial);
  }

  private buildCosmicAtmosphere(
    dustTex: THREE.Texture,
    nebulaTex: THREE.Texture,
    rayTex: THREE.Texture,
    pixelRatio: number,
  ): void {
    const rng = createRng(7711);

    // Distant Deep-Space Observatory Beacon at end of cosmic corridor
    const coreSpecs = [
      { color: 0xffe4b8, scale: 32, opacity: 0.22 },
      { color: 0x8fb2ff, scale: 52, opacity: 0.12 },
      { color: 0x6b4ca8, scale: 72, opacity: 0.08 },
    ];
    for (const spec of coreSpecs) {
      const mat = new THREE.SpriteMaterial({
        map: nebulaTex,
        color: spec.color,
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(0, 0.2, -214);
      sprite.scale.set(spec.scale, spec.scale * 0.65, 1);
      sprite.renderOrder = 0;
      this.scene.add(sprite);
      this.coreGlowSprites.push({ sprite, baseOpacity: spec.opacity });
      this.disposables.push(mat);
    }

    // Near foreground cosmic stardust for high-speed parallax contrast
    const dustCount = 850;
    const dPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const t = rng();
      const spine = this.curve.getPointAt(t);
      const angle = rng() * Math.PI * 2;
      const r = 0.6 + rng() * 14.0;
      dPos[i * 3] = spine.x + Math.cos(angle) * r;
      dPos[i * 3 + 1] = spine.y + Math.sin(angle) * r * 0.7;
      dPos[i * 3 + 2] = spine.z + (rng() - 0.5) * 12.0;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));

    this.dustMaterial = createForegroundDustMaterial({
      dustTex,
      pixelRatio,
    });
    const dustPoints = new THREE.Points(dustGeo, this.dustMaterial);
    dustPoints.frustumCulled = false;
    dustPoints.renderOrder = 4;
    this.scene.add(dustPoints);
    this.disposables.push(dustGeo, this.dustMaterial);

    // Subtle volumetric cosmic light shafts
    const rayCount = 18;
    for (let i = 0; i < rayCount; i++) {
      const t = i / rayCount;
      const spine = this.curve.getPointAt(t);
      const side = i % 2 === 0 ? 1 : -1;
      const offset = 6.0 + rng() * 10.0;

      const baseOpacity = 0.075 + rng() * 0.05;
      const mat = new THREE.SpriteMaterial({
        map: rayTex,
        color: i % 3 === 0 ? 0xffeacc : 0x92b4ff,
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
        rotation: side * (0.28 + rng() * 0.22),
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(
        spine.x + side * offset,
        spine.y + 3.0 + (rng() - 0.5) * 4.0,
        spine.z,
      );
      sprite.scale.set(11.0 + rng() * 5.0, 26 + rng() * 6, 1);
      sprite.renderOrder = 0;
      this.scene.add(sprite);
      this.lightRays.push({ sprite, baseOpacity, phase: rng() * Math.PI * 2 });
      this.disposables.push(mat);
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
    this.reducedMotionQuery.addEventListener('change', this.handleReducedMotionChange);
  }

  private handleReducedMotionChange = (e: MediaQueryListEvent): void => {
    this.reducedMotion = e.matches;
    if (this.reducedMotion) {
      this.manualWarp = 0;
      this.warpTimer = 0;
    }
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const pixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);

    if (this.composer) {
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
    if (this.chromaticPass) {
      this.chromaticPass.uniforms.uAspect.value = width / Math.max(1, height);
    }

    this.deepSkyMaterial.uniforms.uPixelRatio.value = pixelRatio;
    this.deepSkyMaterial.uniforms.uResolution.value.set(width, height);
    for (let i = 0; i < this.starLayerMaterials.length; i++) {
      const mat = this.starLayerMaterials[i];
      mat.uniforms.uPixelRatio.value = pixelRatio;
      mat.uniforms.uResolution.value.set(width, height);
    }
    this.nebulaMaterial.uniforms.uPixelRatio.value = pixelRatio;
    this.nebulaMaterial.uniforms.uResolution.value.set(width, height);
    this.dustMaterial.uniforms.uPixelRatio.value = pixelRatio;
    this.cometTrail.setPixelRatio(pixelRatio);
    this.meteorParticles.setPixelRatio(pixelRatio);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    const nx = (e.clientX / width) * 2 - 1;
    const ny = -(e.clientY / height) * 2 + 1;
    if (this.mouseNDC.x > 10) {
      this.mouseNDC.set(nx, ny);
    }
    this.targetMouseNDC.set(nx, ny);
    this.targetMouseTilt.set(nx, ny);
  };

  /**
   * Called by GSAP ScrollTrigger (0 -> 1) to move the camera forward along the galactic corridor.
   */
  public setScrollProgress(progress: number): void {
    this.targetScrollProgress = Math.max(0, Math.min(1, progress));
  }

  /**
   * Triggers a brief hyperspace warp streak jump between sections.
   */
  public triggerWarpJump(durationSec = 0.44): void {
    if (this.reducedMotion) return;
    this.warpTimer = Math.max(this.warpTimer, durationSec);
  }

  public startHoverTransition(): void {
    this.hoverTarget = 1;
    this.audioStore?.().setMuffled(true);
  }

  public stopHoverTransition(): void {
    this.hoverTarget = 0;
    this.audioStore?.().setMuffled(false);
  }

  private checkLandmarkChime(progress: number): void {
    const stops = [
      LANDMARK_STOPS.work,
      LANDMARK_STOPS.about,
      LANDMARK_STOPS.journal,
      LANDMARK_STOPS.contact,
    ];
    let nearest = -1;
    for (let i = 0; i < stops.length; i++) {
      if (computeLandmarkVisibility(progress, stops[i], 0.09) > 0.45) {
        nearest = i;
        break;
      }
    }
    if (nearest !== -1 && nearest !== this.activeLandmarkIndex) {
      this.activeLandmarkIndex = nearest;
      this.audioStore?.().playLandmarkChime(nearest);
    } else if (nearest === -1) {
      this.activeLandmarkIndex = -1;
    }
  }

  private updateCameraTransform(dt: number): void {
    const prevProgress = this.currentScrollProgress;
    const effectiveTarget = Math.min(0.995, this.targetScrollProgress);
    this.currentScrollProgress = this.reducedMotion
      ? effectiveTarget
      : damp(this.currentScrollProgress, effectiveTarget, 6.5, dt);

    const deltaP = dt > 0 ? (this.currentScrollProgress - prevProgress) / dt : 0;
    this.scrollVelocity = damp(this.scrollVelocity, deltaP, 8.0, dt);

    this.checkLandmarkChime(this.currentScrollProgress);

    const t = Math.max(0, Math.min(0.992, this.currentScrollProgress));
    const lookT = Math.min(1, t + 0.045);

    this.curve.getPointAt(t, this._camPos);
    this.curve.getPointAt(lookT, this._lookPos);

    if (!this.reducedMotion) {
      const introDrift = (1 - smoothstep(0, 1, this.introProgress)) * 2.2;
      this._camPos.y += introDrift;

      // Subtle weightless cosmic flight sway (eased smoothly during hover pause)
      const swayAmp = 1 - this.hoverMix * 0.85;
      this._camPos.x += Math.sin(this.elapsedTime * 0.2) * 0.28 * swayAmp;
      this._camPos.y += Math.cos(this.elapsedTime * 0.15) * 0.18 * swayAmp;

      this.mouseTilt.x = damp(this.mouseTilt.x, this.targetMouseTilt.x, 4.0, dt);
      this.mouseTilt.y = damp(this.mouseTilt.y, this.targetMouseTilt.y, 4.0, dt);
    } else {
      this.mouseTilt.set(0, 0);
    }

    const warp = computeWarpIntensity(this.scrollVelocity, this.manualWarp);
    const targetFov = this.reducedMotion ? 58 : 58 + warp * 10.5;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, targetFov, 6.0, dt);
      this.camera.updateProjectionMatrix();
    }

    this._forward.subVectors(this._lookPos, this._camPos).normalize();
    this._right.crossVectors(this._forward, this._up).normalize();

    this._lookPos.addScaledVector(this._right, this.mouseTilt.x * 1.75);
    this._lookPos.y += this.mouseTilt.y * 1.15;

    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._lookPos);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.timeoutId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.timeoutId = window.setTimeout(cb, 80);
        }
      };
      this.timeoutId = window.setTimeout(poll, 5);
    } else {
      this.timeoutId = window.setTimeout(cb, 80);
    }
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;

      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      this.elapsedTime += dt;

      if (this.introProgress < 1) {
        this.introProgress = Math.min(1, this.introProgress + dt * 1.35);
      }
      if (this.introProgress >= 1) {
        this.onIntroDone();
        this.introReported = true;
      } else if (!this.introReported && this.elapsedTime > 0.75) {
        this.introProgress = 1;
        this.onIntroDone();
        this.introReported = true;
      }

      // Warp jump envelope
      if (this.warpTimer > 0) {
        this.warpTimer = Math.max(0, this.warpTimer - dt);
        this.manualWarp = damp(this.manualWarp, 1, 16.0, dt);
      } else {
        this.manualWarp = damp(this.manualWarp, 0, 12.0, dt);
      }

      this.hoverMix = damp(this.hoverMix, this.hoverTarget, 3.2, dt);
      this.mouseNDC.x = damp(this.mouseNDC.x, this.targetMouseNDC.x, 16.0, dt);
      this.mouseNDC.y = damp(this.mouseNDC.y, this.targetMouseNDC.y, 16.0, dt);

      this.updateCameraTransform(dt);

      // Continuous forward star-corridor flow (calm cosmic drifting pace,
      // accelerating gently with scroll speed and easing to a pause on #go hover)
      if (!this.reducedMotion) {
        const flowSpeed = (2.1 + Math.abs(this.scrollVelocity) * 18.0) * (1 - this.hoverMix * 0.94);
        this.flowZ += dt * flowSpeed;
      }

      const warp = this.reducedMotion
        ? 0
        : computeWarpIntensity(this.scrollVelocity, this.manualWarp);

      this.deepSkyMaterial.uniforms.uTime.value = this.elapsedTime;
      this.deepSkyMaterial.uniforms.uCamPos.value.copy(this._camPos);
      this.deepSkyMaterial.uniforms.uMouseNDC.value.copy(this.mouseNDC);
      this.deepSkyMaterial.uniforms.uHoverMix.value = this.reducedMotion ? 0 : this.hoverMix;
      this.deepSkyMaterial.uniforms.uReducedMotion.value = this.reducedMotion ? 1 : 0;

      const reduced = this.reducedMotion ? 1 : 0;
      const hover = this.reducedMotion ? 0 : this.hoverMix;
      for (let i = 0; i < this.starLayerMaterials.length; i++) {
        const mat = this.starLayerMaterials[i];
        mat.uniforms.uTime.value = this.elapsedTime;
        mat.uniforms.uFlowZ.value = this.flowZ;
        mat.uniforms.uCamPos.value.copy(this._camPos);
        mat.uniforms.uMouseNDC.value.copy(this.mouseNDC);
        mat.uniforms.uHoverMix.value = hover;
        mat.uniforms.uReducedMotion.value = reduced;
      }

      this.nebulaMaterial.uniforms.uTime.value = this.elapsedTime;
      this.nebulaMaterial.uniforms.uFlowZ.value = this.flowZ * 0.82;
      this.nebulaMaterial.uniforms.uCamPos.value.copy(this._camPos);
      this.nebulaMaterial.uniforms.uMouseNDC.value.copy(this.mouseNDC);
      this.nebulaMaterial.uniforms.uHoverMix.value = this.reducedMotion ? 0 : this.hoverMix;

      this.dustMaterial.uniforms.uFlowZ.value = this.flowZ;
      this.dustMaterial.uniforms.uCamZ.value = this._camPos.z;
      this.dustMaterial.uniforms.uHoverMix.value = this.reducedMotion ? 0 : this.hoverMix;

      this.cometTrail.update(this.mouseNDC.x, this.mouseNDC.y, dt, this.reducedMotion);
      this.warpSystem.material.uniforms.uWarp.value = warp;
      this.warpSystem.material.uniforms.uTime.value = this.elapsedTime;

      // Anchor distant slow-moving falling star particles relative to active camera position
      // and stretch/taper their trails smoothly during high-speed scroll & warp travel
      const travelSpeed = Math.min(1, Math.abs(this.scrollVelocity) * 2.6 + warp * 0.85);
      this.meteorParticles.update(
        this.elapsedTime,
        this._camPos,
        this.hoverMix,
        this.reducedMotion,
        travelSpeed,
      );

      // Fade landmarks smoothly in out of cosmic dust as camera approaches each sector
      const p = this.currentScrollProgress;
      const nebVis = computeLandmarkVisibility(p, LANDMARK_STOPS.work, 0.21);
      const planetVis = computeLandmarkVisibility(p, LANDMARK_STOPS.about, 0.21);
      const galVis = computeLandmarkVisibility(p, LANDMARK_STOPS.journal, 0.21);
      const beaconVis = Math.max(0.15, computeLandmarkVisibility(p, LANDMARK_STOPS.contact, 0.28));

      this.landmarks.setNebulaOpacity(nebVis);
      this.landmarks.setPlanetOpacity(planetVis);
      this.landmarks.setGalaxyOpacity(galVis);

      // Subtle rotation on planetary and spiral galaxy landmarks
      if (!this.reducedMotion) {
        this.landmarks.planetGroup.rotation.y += dt * 0.08;
        this.landmarks.galaxyGroup.rotation.y += dt * 0.14;
      }

      for (let i = 0; i < this.coreGlowSprites.length; i++) {
        const g = this.coreGlowSprites[i];
        g.sprite.material.opacity = g.baseOpacity * beaconVis * (1 - this.hoverMix * 0.5);
      }
      for (let i = 0; i < this.lightRays.length; i++) {
        const r = this.lightRays[i];
        r.sprite.material.opacity =
          r.baseOpacity * (0.82 + 0.18 * Math.sin(this.elapsedTime * 0.4 + r.phase)) * (1 - this.hoverMix * 0.65);
      }

      const speedScalar = Math.min(1, Math.abs(this.scrollVelocity) * 3.5 + warp * 0.7);
      const vigStrength = computeVignetteStrength(speedScalar, this.hoverMix);
      this.onVignetteChange?.(vigStrength);

      const milestoneAudio = computeMilestoneAudioState(p, speedScalar);
      this.audioStore?.().updateMilestoneAudio(
        milestoneAudio.proximity,
        milestoneAudio.nearestIndex,
        speedScalar,
      );

      if (this.bloomPass) {
        const peakLandmark = Math.max(nebVis, planetVis, galVis);
        const bloom = computeBloomParams(warp, this.hoverMix, peakLandmark, this.reducedMotion);
        this.bloomPass.strength = bloom.strength;
        this.bloomPass.radius = bloom.radius;
        this.bloomPass.threshold = bloom.threshold;
      }

      if (this.chromaticPass) {
        this.chromaticPass.uniforms.uIntensity.value = computeChromaticIntensity(
          this.scrollVelocity,
          warp,
          this.reducedMotion,
          this.hoverMix,
        );
      }

      if (this.splitRgbPass) {
        this.splitRgbPass.uniforms.uTime.value = this.elapsedTime;
        this.splitRgbPass.uniforms.uSpeedIntensity.value = speedScalar;
        this.splitRgbPass.uniforms.uVignetteStrength.value = vigStrength;
        this.splitRgbPass.uniforms.uHoverMix.value = this.hoverMix;
      }

      if (this.isSoftwareGl || !this.composer) {
        this.renderer.render(this.scene, this.camera);
        this.afterDraw(tick);
      } else {
        this.composer.render();
        this.rafId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.timeoutId = window.setTimeout(tick, 16);
    } else {
      this.rafId = requestAnimationFrame(tick);
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.timeoutId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointermove', this.handlePointerMove);
    this.reducedMotionQuery.removeEventListener('change', this.handleReducedMotionChange);

    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];

    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }
}
