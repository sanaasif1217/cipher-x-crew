/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { RealStarId } from '../data/starExploreCatalog';

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

const SIMPLEX_NOISE_3D_GLSL = `
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  float val = 0.0;
  float amp = 0.56;
  for (int i = 0; i < 3; i++) {
    val += amp * snoise(p);
    p = p * 2.12 + vec3(1.7, -1.3, 0.9);
    amp *= 0.48;
  }
  return val;
}
`;

interface PhotosphereConfig {
  colorCore: string;
  colorMid: string;
  colorDark: string;
  colorRim: string;
  granuleScale: number;
  flowSpeed: number;
  bandStrength: number;
  pulseSpeed: number;
  pulseAmp: number;
  flareIntensity: number;
}

function createPhotosphereMaterial(cfg: PhotosphereConfig): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uColorCore: { value: new THREE.Color(cfg.colorCore) },
      uColorMid: { value: new THREE.Color(cfg.colorMid) },
      uColorDark: { value: new THREE.Color(cfg.colorDark) },
      uColorRim: { value: new THREE.Color(cfg.colorRim) },
      uGranuleScale: { value: cfg.granuleScale },
      uFlowSpeed: { value: cfg.flowSpeed },
      uBandStrength: { value: cfg.bandStrength },
      uPulseSpeed: { value: cfg.pulseSpeed },
      uPulseAmp: { value: cfg.pulseAmp },
      uFlareIntensity: { value: cfg.flareIntensity },
    },
    transparent: true,
    vertexShader: `
      uniform float uTime;
      uniform float uPulseSpeed;
      uniform float uPulseAmp;
      varying vec3 vLocalPos;
      varying vec3 vWorldNormal;
      varying vec3 vViewPos;

      ${SIMPLEX_NOISE_3D_GLSL}

      void main() {
        vec3 n = normalize(position);
        float boil = fbm(n * 3.1 + vec3(uTime * 0.14)) * 0.028;
        float breath = sin(uTime * uPulseSpeed) * uPulseAmp;
        vec3 displaced = position * (1.0 + boil + breath);

        vLocalPos = normalize(position);
        vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
        vViewPos = -mvPos.xyz;
        vWorldNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColorCore;
      uniform vec3 uColorMid;
      uniform vec3 uColorDark;
      uniform vec3 uColorRim;
      uniform float uGranuleScale;
      uniform float uFlowSpeed;
      uniform float uBandStrength;
      uniform float uPulseSpeed;
      uniform float uPulseAmp;
      uniform float uFlareIntensity;

      varying vec3 vLocalPos;
      varying vec3 vWorldNormal;
      varying vec3 vViewPos;

      ${SIMPLEX_NOISE_3D_GLSL}

      void main() {
        vec3 viewDir = normalize(vViewPos);
        float ndotv = clamp(dot(normalize(vWorldNormal), viewDir), 0.0, 1.0);

        float t = uTime * uFlowSpeed;
        vec3 domain = vLocalPos * uGranuleScale;
        float warp = fbm(domain * 0.65 + vec3(t * 0.35, -t * 0.25, t * 0.2));
        float gran = fbm(domain + vec3(warp * 1.15) + vec3(0.0, t * 0.4, -t * 0.3));
        float fineCells = snoise(vLocalPos * (uGranuleScale * 2.8) - vec3(t * 0.6));

        // Optional atmospheric zonal banding for brown dwarfs & Y dwarfs
        float lat = vLocalPos.y;
        float bandWave = sin(lat * 13.0 + warp * 3.4 + sin(lat * 5.0 + t * 0.5) * 1.6);
        float bands = mix(0.0, bandWave * 0.5 + 0.5, clamp(uBandStrength, 0.0, 1.4));

        // Physical convective temperature mix
        float heat = clamp(0.52 + gran * 0.65 + fineCells * 0.16 - bands * 0.32, 0.0, 1.0);

        // Pulsation shimmer (prominent for Mira giant R Draconis & accretion flare)
        float pulseMod = 1.0 + sin(uTime * uPulseSpeed) * (uPulseAmp * 2.6);
        heat = clamp(heat * (0.94 + 0.12 * pulseMod), 0.0, 1.0);

        vec3 surf = mix(uColorDark, uColorMid, smoothstep(0.14, 0.58, heat));
        surf = mix(surf, uColorCore, smoothstep(0.56, 0.94, heat));

        // Active bright plasma spots & flares
        float flareSpot = smoothstep(0.66, 0.92, gran + fineCells * 0.32) * uFlareIntensity;
        surf += uColorCore * flareSpot * 0.65;

        // Limb darkening & incandescent chromospheric edge scattering
        float limbDark = pow(ndotv, 0.44);
        float rimGlow = pow(1.0 - ndotv, 2.65);
        vec3 col = surf * (0.45 + 0.68 * limbDark) + uColorRim * rimGlow * 1.15;

        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
}

function createCoronaMaterial(colorHex: string, power = 3.2, intensity = 1.1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uColor: { value: new THREE.Color(colorHex) },
      uPower: { value: power },
      uIntensity: { value: intensity },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vec3 viewDir = normalize(vViewPos);
        float edge = clamp(dot(normalize(-vNormal), viewDir), 0.0, 1.0);
        float glow = pow(edge, uPower) * uIntensity;
        float breathe = 0.94 + 0.06 * sin(uTime * 1.8);
        gl_FragColor = vec4(uColor * glow * breathe, clamp(glow * uOpacity, 0.0, 1.0));
      }
    `,
  });
}

function createShellLayerMaterial(colorHex: string, opacityBase = 0.24): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uBaseAlpha: { value: opacityBase },
      uColor: { value: new THREE.Color(colorHex) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec3 vLocal;
      void main() {
        vLocal = normalize(position);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uBaseAlpha;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec3 vLocal;
      ${SIMPLEX_NOISE_3D_GLSL}
      void main() {
        vec3 viewDir = normalize(vViewPos);
        float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), viewDir), 0.0, 1.0), 2.1);
        float wisp = 0.65 + 0.35 * snoise(vLocal * 3.8 + vec3(uTime * 0.25, -uTime * 0.18, 0.0));
        float alpha = fresnel * wisp * uBaseAlpha * uOpacity;
        gl_FragColor = vec4(uColor * (0.9 + fresnel * 0.8), clamp(alpha, 0.0, 0.85));
      }
    `,
  });
}

function createAccretionDiskMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uColorInner: { value: new THREE.Color('#fff2cf') },
      uColorMid: { value: new THREE.Color('#ff9d42') },
      uColorOuter: { value: new THREE.Color('#7a321c') },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColorInner;
      uniform vec3 uColorMid;
      uniform vec3 uColorOuter;
      varying vec3 vLocal;

      void main() {
        float r = length(vLocal.xy);
        float angle = atan(vLocal.y, vLocal.x);
        float tNorm = clamp((r - 1.32) / 2.38, 0.0, 1.0);

        // Dual Keplerian spiral tidal waves + inner rim fade
        float omega = uTime * (1.4 - tNorm * 0.85);
        float spiral1 = sin(angle * 2.0 - r * 5.2 + omega) * 0.5 + 0.5;
        float spiral2 = sin(angle * 3.0 - r * 8.4 + omega * 1.3) * 0.5 + 0.5;
        float gap = smoothstep(0.18, 0.9, sin(r * 7.5 + omega * 0.4) * 0.5 + 0.5);

        float alpha = smoothstep(0.0, 0.12, tNorm) * (1.0 - smoothstep(0.55, 1.0, tNorm));
        alpha *= (0.38 + 0.46 * spiral1 + 0.24 * spiral2) * (0.45 + 0.55 * gap);

        vec3 col = mix(uColorInner, uColorMid, smoothstep(0.0, 0.45, tNorm));
        col = mix(col, uColorOuter, smoothstep(0.42, 0.95, tNorm));
        col *= 0.85 + spiral1 * 0.55;

        gl_FragColor = vec4(col, clamp(alpha * 0.88 * uOpacity, 0.0, 0.95));
      }
    `,
  });
}

function createStarGlowTexture(
  innerHex: string,
  midHex: string,
  includeSpikes: boolean,
  maxAniso: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;

  const grad = ctx.createRadialGradient(half, half, 2, half, half, half);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.14, innerHex);
  grad.addColorStop(0.42, midHex);
  grad.addColorStop(0.75, 'rgba(0,0,0,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  if (includeSpikes) {
    ctx.save();
    ctx.translate(half, half);
    ctx.globalCompositeOperation = 'lighter';
    for (const deg of [0, 90]) {
      ctx.save();
      ctx.rotate((deg * Math.PI) / 180);
      const spikeGrad = ctx.createLinearGradient(-half, 0, half, 0);
      spikeGrad.addColorStop(0, 'rgba(255,255,255,0)');
      spikeGrad.addColorStop(0.38, 'rgba(255,244,220,0.08)');
      spikeGrad.addColorStop(0.5, 'rgba(255,255,255,0.28)');
      spikeGrad.addColorStop(0.62, 'rgba(255,244,220,0.08)');
      spikeGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spikeGrad;
      ctx.fillRect(-half, -1.2, size, 2.4);
      ctx.restore();
    }
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

interface StarAssemblyRecord {
  id: RealStarId;
  root: THREE.Group;
  inspectGroup: THREE.Group;
  shaderMaterials: THREE.ShaderMaterial[];
  opacityTargets: Array<{ mat: THREE.Material; baseOpacity: number }>;
  slideX: number;
  startSlideX: number;
  targetSlideX: number;
  slideStartMs: number;
  spinRate: number;
  updateDynamic: (elapsed: number, slideVisibility: number) => void;
}

export class StarCarouselEngine {
  private host: HTMLElement;
  private isSoftwareGl: boolean;
  private reducedMotion: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;

  private assemblies: StarAssemblyRecord[] = [];
  private activeIndex = 0;

  private ambientPoints!: THREE.Points;
  private ambientGeo!: THREE.BufferGeometry;
  private ambientMat!: THREE.PointsMaterial;

  private disposables: Array<{ dispose: () => void }> = [];

  private isVisible = true;
  private disposed = false;
  private rafId = 0;
  private timeoutId = 0;
  private activeSync: WebGLSync | null = null;
  private lastTime = performance.now();
  private elapsed = 0;

  // Interactive drag-to-orbit rotation
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private dragYawTarget = 0;
  private dragPitchTarget = 0.08;
  private dragYaw = 0;
  private dragPitch = 0.08;

  private resizeObserver: ResizeObserver | null = null;
  private visibilityObserver: IntersectionObserver | null = null;

  constructor(host: HTMLElement, initialStarId: RealStarId, idsOrder: RealStarId[]) {
    this.host = host;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.activeIndex = Math.max(0, idsOrder.indexOf(initialStarId));

    this.initScene(idsOrder);
    this.bindEvents();
    this.startLoop();
  }

  private initScene(idsOrder: RealStarId[]) {
    const width = Math.max(320, this.host.clientWidth || 560);
    const height = Math.max(260, this.host.clientHeight || 410);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.className = 'explore3d-webgl-canvas';
    this.host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    this.camera.position.set(0, 0.12, 7.6);

    // Procedural Deep-Space Environment Reflection per Three.js directives
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRenderTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    pmremGenerator.dispose();

    // Warm/cool 3-point stellar lighting
    const hemi = new THREE.HemisphereLight('#bfd8ff', '#2a1610', 0.65);
    const key = new THREE.DirectionalLight('#fff1db', 2.1);
    key.position.set(4.5, 3.2, 5.2);
    const rim = new THREE.DirectionalLight('#8bb2ff', 0.85);
    rim.position.set(-4.2, -2.5, -3.5);
    this.scene.add(hemi, key, rim);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Deep-space surrounding parallax bokeh starfield
    const starCount = this.isSoftwareGl ? 130 : 260;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    let seed = 918273;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const palette = [
      new THREE.Color('#fff4e2'),
      new THREE.Color('#ffd0a3'),
      new THREE.Color('#d2e2ff'),
      new THREE.Color('#ffffff'),
    ];
    for (let i = 0; i < starCount; i += 1) {
      starPositions[i * 3] = (rand() - 0.5) * 20;
      starPositions[i * 3 + 1] = (rand() - 0.5) * 11;
      starPositions[i * 3 + 2] = -2.5 - rand() * 14;
      const c = palette[Math.floor(rand() * palette.length)];
      starColors[i * 3] = c.r;
      starColors[i * 3 + 1] = c.g;
      starColors[i * 3 + 2] = c.b;
    }
    this.ambientGeo = new THREE.BufferGeometry();
    this.ambientGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.ambientGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    this.ambientMat = new THREE.PointsMaterial({
      size: 0.085,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ambientPoints = new THREE.Points(this.ambientGeo, this.ambientMat);
    this.scene.add(this.ambientPoints);

    // Shared sphere geometries (segment count tuned for software WebGL responsiveness)
    const hiSeg = this.isSoftwareGl ? 32 : 64;
    const midSeg = this.isSoftwareGl ? 24 : 48;
    const sphereHighGeo = new THREE.SphereGeometry(1, hiSeg, hiSeg);
    const sphereMidGeo = new THREE.SphereGeometry(1, midSeg, midSeg);
    this.disposables.push(sphereHighGeo, sphereMidGeo);

    idsOrder.forEach((starId, idx) => {
      const record = this.buildStarAssembly(starId, sphereHighGeo, sphereMidGeo, maxAniso);
      const isInitial = idx === this.activeIndex;
      record.slideX = isInitial ? 0 : idx < this.activeIndex ? -7.4 : 7.4;
      record.startSlideX = record.slideX;
      record.targetSlideX = record.slideX;
      record.slideStartMs = 0;
      record.root.position.x = record.slideX;
      record.root.visible = isInitial;
      this.scene.add(record.root);
      this.assemblies.push(record);
    });

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Immediate first frame draw so snapshots are instant
    this.updateAssemblies(0);
    this.renderer.render(this.scene, this.camera);
  }

  private buildStarAssembly(
    starId: RealStarId,
    sphereHighGeo: THREE.BufferGeometry,
    sphereMidGeo: THREE.BufferGeometry,
    maxAniso: number,
  ): StarAssemblyRecord {
    const root = new THREE.Group();
    const inspectGroup = new THREE.Group();
    root.add(inspectGroup);

    const shaderMaterials: THREE.ShaderMaterial[] = [];
    const opacityTargets: Array<{ mat: THREE.Material; baseOpacity: number }> = [];

    const registerShader = (mat: THREE.ShaderMaterial) => {
      shaderMaterials.push(mat);
      this.disposables.push(mat);
      return mat;
    };

    const registerOpacityMat = <T extends THREE.Material>(mat: T, baseOpacity: number): T => {
      opacityTargets.push({ mat, baseOpacity });
      this.disposables.push(mat);
      return mat;
    };

    if (starId === 'barnards-star') {
      // M4.0V Red Dwarf: turbulent ruby photosphere + chromosphere + plasma loops + fast drift dust
      const coreMat = registerShader(
        createPhotosphereMaterial({
          colorCore: '#fff2cf',
          colorMid: '#ff7038',
          colorDark: '#59110a',
          colorRim: '#ff9654',
          granuleScale: 3.4,
          flowSpeed: 0.24,
          bandStrength: 0.0,
          pulseSpeed: 1.5,
          pulseAmp: 0.008,
          flareIntensity: 1.15,
        }),
      );
      const starMesh = new THREE.Mesh(sphereHighGeo, coreMat);
      starMesh.scale.setScalar(1.48);
      inspectGroup.add(starMesh);

      const coronaMat = registerShader(createCoronaMaterial('#ff7038', 2.4, 1.55));
      const coronaMesh = new THREE.Mesh(sphereMidGeo, coronaMat);
      coronaMesh.scale.setScalar(1.94);
      inspectGroup.add(coronaMesh);

      const glowTex = createStarGlowTexture('rgba(255,212,172,0.88)', 'rgba(255,98,42,0.34)', true, maxAniso);
      this.disposables.push(glowTex);
      const glowSprite = new THREE.Sprite(
        registerOpacityMat(
          new THREE.SpriteMaterial({
            map: glowTex,
            color: 0xffffff,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            opacity: 0.92,
          }),
          0.92,
        ),
      );
      glowSprite.scale.set(6.2, 6.2, 1);
      inspectGroup.add(glowSprite);

      // Volumetric chromospheric plasma envelope hugging Barnard's Star cleanly
      const chromosphereMat = registerShader(createShellLayerMaterial('#ff8844', 0.36));
      const chromosphereMesh = new THREE.Mesh(sphereMidGeo, chromosphereMat);
      chromosphereMesh.scale.setScalar(1.56);
      inspectGroup.add(chromosphereMesh);

      // Soft localized coronal flare plumes anchored into the rotating photosphere
      const plumeGroup = new THREE.Group();
      const plumeTex = createStarGlowTexture('rgba(255,228,184,0.82)', 'rgba(255,104,48,0.22)', false, maxAniso);
      this.disposables.push(plumeTex);
      const plumeAngles = [0.65, 2.75, 4.65];
      const plumeYs = [0.42, -0.35, 0.12];
      for (let i = 0; i < plumeAngles.length; i += 1) {
        const angle = plumeAngles[i];
        const plumeSprite = new THREE.Sprite(
          registerOpacityMat(
            new THREE.SpriteMaterial({
              map: plumeTex,
              transparent: true,
              opacity: 0.52,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
            0.52,
          ),
        );
        const r = 1.48;
        plumeSprite.position.set(Math.cos(angle) * r, plumeYs[i], Math.sin(angle) * r);
        plumeSprite.scale.set(0.92, 0.92, 1);
        plumeGroup.add(plumeSprite);
      }
      inspectGroup.add(plumeGroup);

      // Streaming cosmic dust grains conveying proper-motion travel
      const dustCount = this.isSoftwareGl ? 150 : 320;
      const dustPos = new Float32Array(dustCount * 3);
      for (let i = 0; i < dustCount; i += 1) {
        dustPos[i * 3] = ((i * 37) % 100) / 16.5 - 3.0;
        dustPos[i * 3 + 1] = (((i * 73) % 100) / 100 - 0.5) * 4.4;
        dustPos[i * 3 + 2] = (((i * 53) % 100) / 100 - 0.5) * 3.8;
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
      this.disposables.push(dustGeo);
      const dustMat = registerOpacityMat(
        new THREE.PointsMaterial({
          color: '#ffd0ad',
          size: 0.045,
          transparent: true,
          opacity: 0.52,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        0.52,
      );
      const dustPoints = new THREE.Points(dustGeo, dustMat);
      inspectGroup.add(dustPoints);

      return {
        id: starId,
        root,
        inspectGroup,
        shaderMaterials,
        opacityTargets,
        slideX: 0,
        startSlideX: 0,
        targetSlideX: 0,
        slideStartMs: 0,
        spinRate: 0.22,
        updateDynamic: (elapsed, slideVis) => {
          starMesh.rotation.y = elapsed * 0.19;
          plumeGroup.rotation.y = elapsed * 0.19;
          const posAttr = dustGeo.getAttribute('position') as THREE.BufferAttribute;
          const arr = posAttr.array as Float32Array;
          for (let i = 0; i < dustCount; i += 1) {
            let x = arr[i * 3] - 0.014;
            if (x < -3.2) x = 3.2;
            arr[i * 3] = x;
          }
          posAttr.needsUpdate = true;
          for (const item of shaderMaterials) {
            item.uniforms.uTime.value = elapsed;
            item.uniforms.uOpacity.value = slideVis;
          }
        },
      };
    }

    if (starId === 'epsilon-indi-b') {
      // Binary Brown Dwarf Pair (T1V Ba + T6V Bb) waltzing in true 3D barycentric orbit
      const orbitPlane = new THREE.Group();
      orbitPlane.rotation.set(0.32, 0.2, -0.14);
      inspectGroup.add(orbitPlane);

      // Luminous orbit track guide ellipse
      const trackPts: THREE.Vector3[] = [];
      for (let i = 0; i < 96; i += 1) {
        const a = (i / 96) * Math.PI * 2;
        trackPts.push(new THREE.Vector3(Math.cos(a) * 1.48, 0, Math.sin(a) * 1.48));
      }
      const trackGeo = new THREE.BufferGeometry().setFromPoints(trackPts);
      this.disposables.push(trackGeo);
      const trackMat = registerOpacityMat(
        new THREE.LineBasicMaterial({
          color: '#f5efe2',
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        }),
        0.2,
      );
      orbitPlane.add(new THREE.LineLoop(trackGeo, trackMat));

      // Ba (Warmer T1V copper-amber brown dwarf)
      const baGroup = new THREE.Group();
      const baMat = registerShader(
        createPhotosphereMaterial({
          colorCore: '#ffdfa8',
          colorMid: '#d96f32',
          colorDark: '#3c150c',
          colorRim: '#ffaa64',
          granuleScale: 3.1,
          flowSpeed: 0.2,
          bandStrength: 1.05,
          pulseSpeed: 1.1,
          pulseAmp: 0.004,
          flareIntensity: 0.55,
        }),
      );
      const baMesh = new THREE.Mesh(sphereHighGeo, baMat);
      baMesh.scale.setScalar(1.04);
      const baHalo = new THREE.Mesh(sphereMidGeo, registerShader(createCoronaMaterial('#ff9652', 2.6, 1.25)));
      baHalo.scale.setScalar(1.32);
      const baTex = createStarGlowTexture('rgba(255,212,160,0.78)', 'rgba(220,108,45,0.28)', false, maxAniso);
      this.disposables.push(baTex);
      const baSprite = new THREE.Sprite(
        registerOpacityMat(
          new THREE.SpriteMaterial({
            map: baTex,
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
          0.78,
        ),
      );
      baSprite.scale.set(3.8, 3.8, 1);
      baGroup.add(baMesh, baHalo, baSprite);
      orbitPlane.add(baGroup);

      // Bb (Cooler T6V violet-magenta methane brown dwarf)
      const bbGroup = new THREE.Group();
      const bbMat = registerShader(
        createPhotosphereMaterial({
          colorCore: '#f6c8ff',
          colorMid: '#a854ad',
          colorDark: '#231036',
          colorRim: '#d7a1ff',
          granuleScale: 3.6,
          flowSpeed: 0.28,
          bandStrength: 1.15,
          pulseSpeed: 1.3,
          pulseAmp: 0.004,
          flareIntensity: 0.55,
        }),
      );
      const bbMesh = new THREE.Mesh(sphereHighGeo, bbMat);
      bbMesh.scale.setScalar(0.76);
      const bbHalo = new THREE.Mesh(sphereMidGeo, registerShader(createCoronaMaterial('#b874ff', 2.7, 1.25)));
      bbHalo.scale.setScalar(0.98);
      const bbTex = createStarGlowTexture('rgba(232,188,255,0.72)', 'rgba(138,72,204,0.26)', false, maxAniso);
      this.disposables.push(bbTex);
      const bbSprite = new THREE.Sprite(
        registerOpacityMat(
          new THREE.SpriteMaterial({
            map: bbTex,
            transparent: true,
            opacity: 0.74,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
          0.74,
        ),
      );
      bbSprite.scale.set(2.9, 2.9, 1);
      bbGroup.add(bbMesh, bbHalo, bbSprite);
      orbitPlane.add(bbGroup);

      // Distant host star Epsilon Indi A glint
      const hostTex = createStarGlowTexture('rgba(255,244,210,0.9)', 'rgba(255,196,120,0.22)', true, maxAniso);
      this.disposables.push(hostTex);
      const hostSprite = new THREE.Sprite(
        registerOpacityMat(
          new THREE.SpriteMaterial({
            map: hostTex,
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
          0.78,
        ),
      );
      hostSprite.position.set(-2.35, 1.45, -2.8);
      hostSprite.scale.set(1.5, 1.5, 1);
      inspectGroup.add(hostSprite);

      return {
        id: starId,
        root,
        inspectGroup,
        shaderMaterials,
        opacityTargets,
        slideX: 0,
        startSlideX: 0,
        targetSlideX: 0,
        slideStartMs: 0,
        spinRate: 0.08,
        updateDynamic: (elapsed, slideVis) => {
          const theta = elapsed * 0.62;
          baGroup.position.set(Math.cos(theta) * 1.15, 0, Math.sin(theta) * 1.15);
          bbGroup.position.set(-Math.cos(theta) * 1.55, 0, -Math.sin(theta) * 1.55);
          baMesh.rotation.y = elapsed * 0.34;
          bbMesh.rotation.y = -elapsed * 0.42;
          for (const item of shaderMaterials) {
            item.uniforms.uTime.value = elapsed;
            item.uniforms.uOpacity.value = slideVis;
          }
        },
      };
    }

    if (starId === 'wise-0855') {
      // Class Y Sub-Brown Dwarf (~240 K): icy banded slate clouds + glowing deep infrared fissures
      const dwarfMat = registerShader(
        createPhotosphereMaterial({
          colorCore: '#e8f1ff',
          colorMid: '#5b6f8f',
          colorDark: '#0f1624',
          colorRim: '#a9c7ef',
          granuleScale: 3.3,
          flowSpeed: 0.25,
          bandStrength: 1.32,
          pulseSpeed: 1.0,
          pulseAmp: 0.004,
          flareIntensity: 0.55,
        }),
      );
      const dwarfMesh = new THREE.Mesh(sphereHighGeo, dwarfMat);
      dwarfMesh.scale.setScalar(1.52);
      dwarfMesh.rotation.z = 0.18;
      inspectGroup.add(dwarfMesh);

      // Subtle atmospheric frost shell & soft thermal corona
      const hazeMat = registerShader(createShellLayerMaterial('#bcd4f7', 0.34));
      const hazeMesh = new THREE.Mesh(sphereMidGeo, hazeMat);
      hazeMesh.scale.setScalar(1.62);
      inspectGroup.add(hazeMesh);

      const coronaMesh = new THREE.Mesh(sphereMidGeo, registerShader(createCoronaMaterial('#82a4d6', 3.4, 1.05)));
      coronaMesh.scale.setScalar(1.88);
      inspectGroup.add(coronaMesh);

      const glowTex = createStarGlowTexture('rgba(218,232,255,0.68)', 'rgba(116,148,196,0.2)', false, maxAniso);
      this.disposables.push(glowTex);
      const glowSprite = new THREE.Sprite(
        registerOpacityMat(
          new THREE.SpriteMaterial({
            map: glowTex,
            transparent: true,
            opacity: 0.66,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
          0.66,
        ),
      );
      glowSprite.scale.set(5.2, 5.2, 1);
      inspectGroup.add(glowSprite);

      // Equatorial water-ice cloud wisps & drifting parallax IR dust
      const ringCount = this.isSoftwareGl ? 240 : 520;
      const ringPos = new Float32Array(ringCount * 3);
      for (let i = 0; i < ringCount; i += 1) {
        const a = (i / ringCount) * Math.PI * 2 * 5;
        const r = 1.75 + ((i * 29) % 100) / 85;
        ringPos[i * 3] = Math.cos(a) * r;
        ringPos[i * 3 + 1] = (((i * 47) % 100) / 100 - 0.5) * 0.28;
        ringPos[i * 3 + 2] = Math.sin(a) * r;
      }
      const ringGeo = new THREE.BufferGeometry();
      ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
      this.disposables.push(ringGeo);
      const ringMat = registerOpacityMat(
        new THREE.PointsMaterial({
          color: '#c9ddff',
          size: 0.036,
          transparent: true,
          opacity: 0.42,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        0.42,
      );
      const ringPoints = new THREE.Points(ringGeo, ringMat);
      ringPoints.rotation.set(0.28, 0, 0.16);
      inspectGroup.add(ringPoints);

      return {
        id: starId,
        root,
        inspectGroup,
        shaderMaterials,
        opacityTargets,
        slideX: 0,
        startSlideX: 0,
        targetSlideX: 0,
        slideStartMs: 0,
        spinRate: 0.26,
        updateDynamic: (elapsed, slideVis) => {
          dwarfMesh.rotation.y = elapsed * 0.28;
          ringPoints.rotation.y = elapsed * 0.16;
          for (const item of shaderMaterials) {
            item.uniforms.uTime.value = elapsed;
            item.uniforms.uOpacity.value = slideVis;
          }
        },
      };
    }

    if (starId === 'rw-aurigae') {
      // Young T Tauri Binary wrapped in an angled spiral circumstellar disk & dusty tidal stream
      const primaryMat = registerShader(
        createPhotosphereMaterial({
          colorCore: '#fff9e6',
          colorMid: '#ffbe55',
          colorDark: '#8c4414',
          colorRim: '#ffd985',
          granuleScale: 3.0,
          flowSpeed: 0.34,
          bandStrength: 0.0,
          pulseSpeed: 2.8,
          pulseAmp: 0.012,
          flareIntensity: 1.35,
        }),
      );
      const primaryMesh = new THREE.Mesh(sphereHighGeo, primaryMat);
      primaryMesh.scale.setScalar(1.06);
      inspectGroup.add(primaryMesh);

      const coronaMesh = new THREE.Mesh(sphereMidGeo, registerShader(createCoronaMaterial('#ffb854', 2.7, 1.3)));
      coronaMesh.scale.setScalar(1.42);
      inspectGroup.add(coronaMesh);

      const glowTex = createStarGlowTexture('rgba(255,244,204,0.88)', 'rgba(255,172,72,0.28)', true, maxAniso);
      this.disposables.push(glowTex);
      const glowSprite = new THREE.Sprite(
        registerOpacityMat(
          new THREE.SpriteMaterial({
            map: glowTex,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
          0.85,
        ),
      );
      glowSprite.scale.set(4.5, 4.5, 1);
      inspectGroup.add(glowSprite);

      // Tilted Spiral Protoplanetary Accretion Disk
      const diskGeo = new THREE.RingGeometry(1.32, 3.68, 128, 6);
      this.disposables.push(diskGeo);
      const diskMat = registerShader(createAccretionDiskMaterial());
      const diskMesh = new THREE.Mesh(diskGeo, diskMat);
      diskMesh.rotation.set(1.08, -0.22, 0.14);
      inspectGroup.add(diskMesh);

      // Secondary binary companion orbiting edge of disk
      const compMat = registerShader(
        createPhotosphereMaterial({
          colorCore: '#ffe6b8',
          colorMid: '#ff9644',
          colorDark: '#6b280e',
          colorRim: '#ffc278',
          granuleScale: 2.6,
          flowSpeed: 0.25,
          bandStrength: 0,
          pulseSpeed: 1.8,
          pulseAmp: 0.008,
          flareIntensity: 0.9,
        }),
      );
      const compMesh = new THREE.Mesh(sphereMidGeo, compMat);
      compMesh.scale.setScalar(0.36);
      const compPivot = new THREE.Group();
      compPivot.rotation.set(1.08 - Math.PI / 2, -0.22, 0.14);
      compPivot.add(compMesh);
      inspectGroup.add(compPivot);

      // Swirling tidal stream dust grains
      const streamCount = this.isSoftwareGl ? 420 : 1100;
      const streamPos = new Float32Array(streamCount * 3);
      for (let i = 0; i < streamCount; i += 1) {
        const u = i / streamCount;
        const a = u * Math.PI * 14;
        const r = 1.45 + Math.pow((i * 19) % 100 / 100, 0.85) * 2.4;
        streamPos[i * 3] = Math.cos(a) * r;
        streamPos[i * 3 + 1] = (((i * 61) % 100) / 100 - 0.5) * 0.18;
        streamPos[i * 3 + 2] = Math.sin(a) * r;
      }
      const streamGeo = new THREE.BufferGeometry();
      streamGeo.setAttribute('position', new THREE.BufferAttribute(streamPos, 3));
      this.disposables.push(streamGeo);
      const streamMat = registerOpacityMat(
        new THREE.PointsMaterial({
          color: '#ffd08f',
          size: 0.04,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        0.65,
      );
      const streamPoints = new THREE.Points(streamGeo, streamMat);
      streamPoints.rotation.copy(compPivot.rotation);
      inspectGroup.add(streamPoints);

      return {
        id: starId,
        root,
        inspectGroup,
        shaderMaterials,
        opacityTargets,
        slideX: 0,
        startSlideX: 0,
        targetSlideX: 0,
        slideStartMs: 0,
        spinRate: 0.14,
        updateDynamic: (elapsed, slideVis) => {
          primaryMesh.rotation.y = elapsed * 0.25;
          const orbA = elapsed * 0.72;
          compMesh.position.set(Math.cos(orbA) * 2.25, Math.sin(orbA * 2) * 0.08, Math.sin(orbA) * 2.25);
          streamPoints.rotation.y = elapsed * 0.18;
          for (const item of shaderMaterials) {
            item.uniforms.uTime.value = elapsed;
            item.uniforms.uOpacity.value = slideVis;
          }
        },
      };
    }

    // Default / 'r-draconis': Pulsing Mira Red Giant + Expelled Dust Shells + Glowing Embers
    const miraMat = registerShader(
      createPhotosphereMaterial({
        colorCore: '#fff0c4',
        colorMid: '#ff5c24',
        colorDark: '#470a06',
        colorRim: '#ffaa5e',
        granuleScale: 2.35,
        flowSpeed: 0.18,
        bandStrength: 0.0,
        pulseSpeed: 1.75,
        pulseAmp: 0.095,
        flareIntensity: 1.25,
      }),
    );
    const miraMesh = new THREE.Mesh(sphereHighGeo, miraMat);
    miraMesh.scale.setScalar(1.38);
    inspectGroup.add(miraMesh);

    const miraCorona = new THREE.Mesh(sphereMidGeo, registerShader(createCoronaMaterial('#ff5e2b', 2.4, 1.35)));
    miraCorona.scale.setScalar(1.88);
    inspectGroup.add(miraCorona);

    // Two expelled translucent circumstellar dust shockwave shells
    const shell1 = new THREE.Mesh(sphereMidGeo, registerShader(createShellLayerMaterial('#ff9658', 0.34)));
    shell1.scale.setScalar(2.05);
    const shell2 = new THREE.Mesh(sphereMidGeo, registerShader(createShellLayerMaterial('#ff6e3b', 0.22)));
    shell2.scale.setScalar(2.58);
    inspectGroup.add(shell1, shell2);

    const miraTex = createStarGlowTexture('rgba(255,216,158,0.85)', 'rgba(255,78,34,0.28)', false, maxAniso);
    this.disposables.push(miraTex);
    const miraSprite = new THREE.Sprite(
      registerOpacityMat(
        new THREE.SpriteMaterial({
          map: miraTex,
          transparent: true,
          opacity: 0.84,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
        0.84,
      ),
    );
    miraSprite.scale.set(6.0, 6.0, 1);
    inspectGroup.add(miraSprite);

    // Outward-drifting stellar wind ember particles
    const emberCount = this.isSoftwareGl ? 240 : 560;
    const emberPos = new Float32Array(emberCount * 3);
    for (let i = 0; i < emberCount; i += 1) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / emberCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 1.65 + ((i * 23) % 100) / 72;
      emberPos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      emberPos[i * 3 + 1] = Math.cos(phi) * r;
      emberPos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    this.disposables.push(emberGeo);
    const emberMat = registerOpacityMat(
      new THREE.PointsMaterial({
        color: '#ffb078',
        size: 0.044,
        transparent: true,
        opacity: 0.56,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      0.56,
    );
    const emberPoints = new THREE.Points(emberGeo, emberMat);
    inspectGroup.add(emberPoints);

    return {
      id: starId,
      root,
      inspectGroup,
      shaderMaterials,
      opacityTargets,
      slideX: 0,
      startSlideX: 0,
      targetSlideX: 0,
      slideStartMs: 0,
      spinRate: 0.16,
      updateDynamic: (elapsed, slideVis) => {
        const pulse = 1 + Math.sin(elapsed * 1.75) * 0.06;
        miraMesh.rotation.y = elapsed * 0.15;
        shell1.scale.setScalar(2.02 * (0.97 + 0.045 * Math.sin(elapsed * 1.75 - 0.8)));
        shell2.scale.setScalar(2.54 * (0.97 + 0.045 * Math.sin(elapsed * 1.75 - 1.7)));
        miraCorona.scale.setScalar(1.86 * pulse);
        miraSprite.scale.set(6.0 * pulse, 6.0 * pulse, 1);
        emberPoints.rotation.y = -elapsed * 0.09;
        for (const item of shaderMaterials) {
          item.uniforms.uTime.value = elapsed;
          item.uniforms.uOpacity.value = slideVis;
        }
      },
    };
  }

  public setTargetIndex(nextIndex: number, direction: -1 | 1) {
    if (nextIndex === this.activeIndex || nextIndex < 0 || nextIndex >= this.assemblies.length) {
      return;
    }

    const nowMs = performance.now();
    const prevIndex = this.activeIndex;
    this.activeIndex = nextIndex;

    const outgoing = this.assemblies[prevIndex];
    const incoming = this.assemblies[nextIndex];

    // Park any non-active offscreen stars immediately so quick sequential clicks stay spotless
    for (let i = 0; i < this.assemblies.length; i += 1) {
      if (i !== prevIndex && i !== nextIndex) {
        const a = this.assemblies[i];
        a.slideX = direction * 7.4;
        a.startSlideX = a.slideX;
        a.targetSlideX = a.slideX;
        a.slideStartMs = 0;
        a.root.visible = false;
      }
    }

    // Clicking Next (direction = +1): outgoing slides LEFT (-7.4), incoming enters from RIGHT (+7.4 -> 0)
    // Clicking Prev (direction = -1): outgoing slides RIGHT (+7.4), incoming enters from LEFT (-7.4 -> 0)
    if (outgoing) {
      outgoing.startSlideX = outgoing.slideX;
      outgoing.targetSlideX = -direction * 7.4;
      outgoing.slideStartMs = nowMs;
    }
    if (incoming) {
      incoming.startSlideX = direction * 7.4;
      incoming.slideX = direction * 7.4;
      incoming.targetSlideX = 0;
      incoming.slideStartMs = nowMs;
      incoming.root.position.x = incoming.slideX;
      incoming.root.visible = true;
    }

    // Gently re-center user inspection angle when switching stars
    this.dragYawTarget *= 0.25;
    this.dragPitchTarget = 0.08;

    // Wake render loop immediately so the transition begins cleanly on the very next frame
    window.clearTimeout(this.timeoutId);
    cancelAnimationFrame(this.rafId);
    if (this.activeSync) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      gl.deleteSync(this.activeSync);
      this.activeSync = null;
    }
    this.rafId = requestAnimationFrame(this.tick);
  }

  private bindEvents() {
    const el = this.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      this.isDragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.dragYawTarget += dx * 0.0085;
      this.dragPitchTarget = THREE.MathUtils.clamp(this.dragPitchTarget + dy * 0.007, -0.95, 0.95);
    };

    const onPointerUp = (e: PointerEvent) => {
      this.isDragging = false;
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    this.disposables.push({
      dispose: () => {
        el.removeEventListener('pointerdown', onPointerDown);
        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerup', onPointerUp);
        el.removeEventListener('pointercancel', onPointerUp);
      },
    });

    this.resizeObserver = new ResizeObserver(() => {
      if (this.disposed) return;
      const w = Math.max(320, this.host.clientWidth || 560);
      const h = Math.max(260, this.host.clientHeight || 410);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.renderer.render(this.scene, this.camera);
    });
    this.resizeObserver.observe(this.host);

    this.visibilityObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        this.isVisible = entry ? entry.isIntersecting : true;
        if (this.isVisible && !this.disposed) {
          this.updateAssemblies(0.016);
          this.renderer.render(this.scene, this.camera);
        }
      },
      { threshold: 0.05 },
    );
    this.visibilityObserver.observe(this.host);
  }

  private updateAssemblies(dt: number) {
    this.dragYaw = THREE.MathUtils.damp(this.dragYaw, this.dragYawTarget, 6.5, dt);
    this.dragPitch = THREE.MathUtils.damp(this.dragPitch, this.dragPitchTarget, 6.5, dt);

    // Parallax shift on background bokeh stars
    this.ambientPoints.rotation.y = this.dragYaw * 0.14 + this.elapsed * 0.012;
    this.ambientPoints.rotation.x = this.dragPitch * 0.12;

    const nowMs = performance.now();
    const slideDurationMs = this.reducedMotion ? 1 : 380;

    for (let i = 0; i < this.assemblies.length; i += 1) {
      const a = this.assemblies[i];
      if (a.slideStartMs > 0) {
        const p = Math.min(1, (nowMs - a.slideStartMs) / slideDurationMs);
        const eased = 1 - Math.pow(1 - p, 3);
        a.slideX = THREE.MathUtils.lerp(a.startSlideX, a.targetSlideX, eased);
        if (p >= 1) {
          a.slideX = a.targetSlideX;
          a.slideStartMs = 0;
        }
      } else {
        a.slideX = a.targetSlideX;
      }

      const distNorm = Math.min(1, Math.abs(a.slideX) / 6.2);
      const slideVis = Math.max(0, 1 - distNorm * 1.15);

      if (slideVis <= 0.01 && a.slideStartMs === 0 && i !== this.activeIndex) {
        a.root.visible = false;
        continue;
      }

      a.root.visible = true;
      a.root.position.set(a.slideX, Math.sin(this.elapsed * 0.7 + i) * 0.04, -distNorm * 2.2);

      // Gentle turn during slide + continuous drag inspection tilt
      a.inspectGroup.rotation.y = this.dragYaw + (i === this.activeIndex ? 0 : -a.slideX * 0.16);
      a.inspectGroup.rotation.x = this.dragPitch;

      for (const target of a.opacityTargets) {
        if ('opacity' in target.mat) {
          (target.mat as THREE.Material & { opacity: number }).opacity = target.baseOpacity * slideVis;
        }
      }

      a.updateDynamic(this.elapsed, slideVis);
    }
  }

  private scheduleNext() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (this.activeSync) {
        gl.deleteSync(this.activeSync);
        this.activeSync = null;
      }
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) ?? null;
      this.activeSync = sync;
      gl.flush();
      const pollStartedAt = performance.now();
      const poll = () => {
        if (this.disposed) {
          if (this.activeSync) {
            gl.deleteSync(this.activeSync);
            this.activeSync = null;
          }
          return;
        }
        const activeTransition = this.hasActiveTransition();
        const timedOut = performance.now() - pollStartedAt > (activeTransition ? 160 : 400);
        const state = this.activeSync ? gl.getSyncParameter(this.activeSync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (this.activeSync && state === gl.UNSIGNALED && !timedOut) {
          this.timeoutId = window.setTimeout(poll, 5);
        } else {
          if (this.activeSync) {
            gl.deleteSync(this.activeSync);
            this.activeSync = null;
          }
          const delayMs = activeTransition ? 16 : 80;
          this.timeoutId = window.setTimeout(this.tick, delayMs);
        }
      };
      this.timeoutId = window.setTimeout(poll, 5);
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private hasActiveTransition(): boolean {
    for (let i = 0; i < this.assemblies.length; i += 1) {
      if (Math.abs(this.assemblies[i].slideX - this.assemblies[i].targetSlideX) > 0.02) {
        return true;
      }
    }
    return this.isDragging;
  }

  private tick = () => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.08, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (this.isVisible || this.hasActiveTransition()) {
      if (!this.reducedMotion) {
        this.elapsed += dt;
      }
      this.updateAssemblies(dt);
      this.renderer.render(this.scene, this.camera);
    }

    this.scheduleNext();
  };

  private startLoop() {
    this.lastTime = performance.now();
    this.scheduleNext();
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.timeoutId);
    if (this.activeSync) {
      const gl = this.renderer?.getContext() as WebGL2RenderingContext | undefined;
      gl?.deleteSync(this.activeSync);
      this.activeSync = null;
    }
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    this.ambientGeo?.dispose();
    this.ambientMat?.dispose();
    this.envRenderTarget?.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.renderer?.dispose();
    if (this.renderer?.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
