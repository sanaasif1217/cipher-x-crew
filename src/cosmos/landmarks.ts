import * as THREE from 'three';
import { createRng } from './cosmosMath';

export interface LandmarkBundle {
  nebulaGroup: THREE.Group;
  planetGroup: THREE.Group;
  galaxyGroup: THREE.Group;
  setNebulaOpacity: (alpha: number) => void;
  setPlanetOpacity: (alpha: number) => void;
  setGalaxyOpacity: (alpha: number) => void;
  disposables: Array<{ dispose: () => void }>;
}

/**
 * Generates procedural banded planetary surface texture (sRGB).
 */
function createPlanetSurfaceTexture(): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#1e2c4a');
  grad.addColorStop(0.18, '#364d75');
  grad.addColorStop(0.32, '#5c7aa6');
  grad.addColorStop(0.45, '#b8a998');
  grad.addColorStop(0.55, '#d6c8b4');
  grad.addColorStop(0.68, '#6c80a3');
  grad.addColorStop(0.84, '#2d4064');
  grad.addColorStop(1, '#162038');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 18; i++) {
    const y = (i / 18) * height;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(245, 239, 226, 0.08)' : 'rgba(18, 28, 52, 0.14)';
    ctx.fillRect(0, y, width, 4 + (i % 3) * 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates radial planetary ring texture with concentric Cassini-style divisions.
 */
function createPlanetaryRingTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, 'rgba(245, 239, 226, 0)');
  grad.addColorStop(0.15, 'rgba(220, 212, 198, 0.48)');
  grad.addColorStop(0.36, 'rgba(245, 239, 226, 0.78)');
  grad.addColorStop(0.46, 'rgba(140, 162, 204, 0.14)');
  grad.addColorStop(0.58, 'rgba(235, 228, 214, 0.72)');
  grad.addColorStop(0.82, 'rgba(175, 196, 232, 0.35)');
  grad.addColorStop(1, 'rgba(245, 239, 226, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, 16);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds the 3 destination landmarks positioned along the galactic scroll flight path:
 * 1. Work: Luminous Volumetric Nebula & Young Star Nursery
 * 2. About: Banded Ringed Planet
 * 3. Journal: Tilted Grand-Design Spiral Galaxy
 * Each returns a zero-allocation opacity updater so landmarks emerge cleanly out of cosmic dust.
 */
export function createDestinationLandmarks(
  starAtlas: THREE.Texture,
  nebulaTex: THREE.Texture,
  clusterAtlas: THREE.Texture,
): LandmarkBundle {
  const disposables: Array<{ dispose: () => void }> = [];
  const rng = createRng(55123);

  // 1. Work Landmark: Rich Multi-Layer Nebula Cloud + Bright Young Star Nursery
  const nebulaGroup = new THREE.Group();
  const nebulaCloudLayers: Array<{ mat: THREE.SpriteMaterial; base: number }> = [];
  const cloudConfigs = [
    { x: 0, y: 0, z: 0, color: 0x865ce0, scaleX: 28, scaleY: 22, opacity: 0.48 },
    { x: -3.6, y: 2.1, z: 2.2, color: 0x4ca6e8, scaleX: 24, scaleY: 19, opacity: 0.44 },
    { x: 3.4, y: -1.6, z: -1.4, color: 0xe88cb2, scaleX: 22, scaleY: 17, opacity: 0.36 },
    { x: -1.2, y: -1.0, z: 2.8, color: 0x67d0d8, scaleX: 16, scaleY: 13, opacity: 0.32 },
    { x: 0.6, y: 0.5, z: 1.8, color: 0xffebc2, scaleX: 11, scaleY: 9, opacity: 0.42 },
  ];
  for (const cfg of cloudConfigs) {
    const mat = new THREE.SpriteMaterial({
      map: nebulaTex,
      color: cfg.color,
      transparent: true,
      opacity: cfg.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.set(cfg.x, cfg.y, cfg.z);
    sp.scale.set(cfg.scaleX, cfg.scaleY, 1);
    nebulaGroup.add(sp);
    nebulaCloudLayers.push({ mat, base: cfg.opacity });
    disposables.push(mat);
  }

  const nurseryCount = 640;
  const nPos = new Float32Array(nurseryCount * 3);
  const nCol = new Float32Array(nurseryCount * 3);
  for (let i = 0; i < nurseryCount; i++) {
    const r = Math.pow(rng(), 0.72) * 11.5;
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    nPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    nPos[i * 3 + 1] = r * Math.cos(phi) * 0.74;
    nPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c =
      i % 3 === 0
        ? new THREE.Color('#ffefcf')
        : i % 3 === 1
          ? new THREE.Color('#a6d4ff')
          : new THREE.Color('#f7c6e4');
    nCol[i * 3] = c.r;
    nCol[i * 3 + 1] = c.g;
    nCol[i * 3 + 2] = c.b;
  }
  const nGeo = new THREE.BufferGeometry();
  nGeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
  nGeo.setAttribute('color', new THREE.BufferAttribute(nCol, 3));
  const nMat = new THREE.PointsMaterial({
    map: clusterAtlas,
    size: 0.9,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  nebulaGroup.add(new THREE.Points(nGeo, nMat));
  disposables.push(nGeo, nMat);

  // 2. About Landmark: Ringed Planet (banded sphere + concentric tilted rings + atmosphere rim)
  const planetGroup = new THREE.Group();
  const planetTex = createPlanetSurfaceTexture();
  const ringTex = createPlanetaryRingTexture();
  disposables.push(planetTex, ringTex);

  const sphereGeo = new THREE.SphereGeometry(5.0, 40, 32);
  const sphereMat = new THREE.MeshStandardMaterial({
    map: planetTex,
    roughness: 0.72,
    metalness: 0.08,
    emissive: new THREE.Color(0x16223a),
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 1,
    fog: true,
  });
  const planetMesh = new THREE.Mesh(sphereGeo, sphereMat);
  planetGroup.add(planetMesh);
  disposables.push(sphereGeo, sphereMat);

  const haloMat = new THREE.SpriteMaterial({
    map: nebulaTex,
    color: 0x9ec4ff,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const haloSprite = new THREE.Sprite(haloMat);
  haloSprite.scale.set(16.0, 16.0, 1);
  planetGroup.add(haloSprite);
  disposables.push(haloMat);

  const ringGeo = new THREE.RingGeometry(6.6, 12.2, 72);
  const ringPos = ringGeo.attributes.position as THREE.BufferAttribute;
  const ringUv = ringGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < ringPos.count; i++) {
    const x = ringPos.getX(i);
    const y = ringPos.getY(i);
    const dist = Math.sqrt(x * x + y * y);
    const u = (dist - 6.6) / (12.2 - 6.6);
    ringUv.setXY(i, u, 0.5);
  }
  const ringMat = new THREE.MeshBasicMaterial({
    map: ringTex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    fog: true,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = Math.PI * 0.39;
  ringMesh.rotation.y = 0.24;
  planetGroup.add(ringMesh);
  disposables.push(ringGeo, ringMat);

  // 3. Journal Landmark: Tilted Grand-Design Spiral Galaxy
  const galaxyGroup = new THREE.Group();
  const galCount = 2400;
  const gPos = new Float32Array(galCount * 3);
  const gCol = new Float32Array(galCount * 3);
  const coreCol = new THREE.Color('#fff1d4');
  const armColA = new THREE.Color('#9ec4ff');
  const armColB = new THREE.Color('#d2b5ff');

  for (let i = 0; i < galCount; i++) {
    const arm = i % 2;
    const r = Math.pow(rng(), 0.72) * 14.5;
    const spin = r * 0.42;
    const baseAngle = arm * Math.PI + spin;
    const scatter = (rng() - 0.5) * (0.45 + r * 0.04);
    const angle = baseAngle + scatter;

    gPos[i * 3] = Math.cos(angle) * r;
    gPos[i * 3 + 1] = (rng() - 0.5) * (1.8 * Math.exp(-r * 0.14) + 0.35);
    gPos[i * 3 + 2] = Math.sin(angle) * r;

    const mixT = Math.min(1, r / 12.5);
    const c = coreCol.clone().lerp(i % 2 === 0 ? armColA : armColB, mixT);
    gCol[i * 3] = c.r;
    gCol[i * 3 + 1] = c.g;
    gCol[i * 3 + 2] = c.b;
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  gGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
  const gMat = new THREE.PointsMaterial({
    map: starAtlas,
    size: 0.44,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const spiralPoints = new THREE.Points(gGeo, gMat);
  galaxyGroup.add(spiralPoints);

  const galCoreMat = new THREE.SpriteMaterial({
    map: nebulaTex,
    color: 0xffebd0,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const galCore = new THREE.Sprite(galCoreMat);
  galCore.scale.set(9.5, 6.2, 1);
  galaxyGroup.add(galCore);
  galaxyGroup.rotation.x = 0.48;
  galaxyGroup.rotation.z = -0.25;
  disposables.push(gGeo, gMat, galCoreMat);

  return {
    nebulaGroup,
    planetGroup,
    galaxyGroup,
    setNebulaOpacity(alpha: number) {
      const a = Math.max(0, Math.min(1, alpha));
      nebulaGroup.visible = a > 0.01;
      for (let i = 0; i < nebulaCloudLayers.length; i++) {
        nebulaCloudLayers[i].mat.opacity = nebulaCloudLayers[i].base * a;
      }
      nMat.opacity = 0.92 * a;
    },
    setPlanetOpacity(alpha: number) {
      const a = Math.max(0, Math.min(1, alpha));
      planetGroup.visible = a > 0.01;
      sphereMat.opacity = a;
      ringMat.opacity = 0.88 * a;
      haloMat.opacity = 0.24 * a;
    },
    setGalaxyOpacity(alpha: number) {
      const a = Math.max(0, Math.min(1, alpha));
      galaxyGroup.visible = a > 0.01;
      gMat.opacity = 0.92 * a;
      galCoreMat.opacity = 0.48 * a;
    },
    disposables,
  };
}

/**
 * Zero-allocation ring-buffer pointer comet trail rendered as glowing stardust particles.
 */
export function createPointerCometTrail(pixelRatio: number) {
  const count = 34;
  const positions = new Float32Array(count * 3);
  const ages = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = 99;
    positions[i * 3 + 1] = 99;
    positions[i * 3 + 2] = 0;
    ages[i] = 1;
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const ageAttr = new THREE.BufferAttribute(ages, 1);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('aAge', ageAttr);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader: /* glsl */ `
      attribute float aAge;
      uniform float uPixelRatio;
      varying float vLife;

      void main() {
        vLife = clamp(1.0 - aAge, 0.0, 1.0);
        gl_Position = vec4(position.xy, 0.0, 1.0);
        gl_PointSize = mix(2.5, 32.0, pow(vLife, 1.25)) * uPixelRatio;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vLife;

      void main() {
        if (vLife <= 0.01) discard;
        vec2 uv = gl_PointCoord - 0.5;
        float r = length(uv) * 2.0;
        float glow = exp(-r * r * 3.8);
        float core = exp(-r * r * 12.0);
        vec3 col = mix(vec3(0.7, 0.86, 1.0), vec3(1.0, 0.97, 0.9), core);
        float alpha = (glow * 0.55 + core * 0.78) * vLife;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 10;

  let headIndex = 0;
  let lastX = 99;
  let lastY = 99;

  return {
    points,
    update(ndcX: number, ndcY: number, dt: number, reducedMotion: boolean) {
      for (let i = 0; i < count; i++) {
        ages[i] = Math.min(1, ages[i] + dt * 1.35);
      }
      if (!reducedMotion && Math.abs(ndcX) <= 1.1 && Math.abs(ndcY) <= 1.1) {
        if (lastX > 10) {
          positions[headIndex * 3] = ndcX;
          positions[headIndex * 3 + 1] = ndcY;
          ages[headIndex] = 0;
          headIndex = (headIndex + 1) % count;
          lastX = ndcX;
          lastY = ndcY;
        } else {
          const dx = ndcX - lastX;
          const dy = ndcY - lastY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0.004) {
            const steps = Math.min(3, Math.max(1, Math.ceil(dist / 0.05)));
            for (let s = 1; s <= steps; s++) {
              const t = s / steps;
              positions[headIndex * 3] = lastX + dx * t;
              positions[headIndex * 3 + 1] = lastY + dy * t;
              ages[headIndex] = (steps - s) * 0.05;
              headIndex = (headIndex + 1) % count;
            }
            lastX = ndcX;
            lastY = ndcY;
          }
        }
      }
      posAttr.needsUpdate = true;
      ageAttr.needsUpdate = true;
    },
    setPixelRatio(pr: number) {
      material.uniforms.uPixelRatio.value = pr;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Creates a zero-allocation Warp Jump Streak LineSegments shell framing the outer corridor.
 */
export function createWarpStreakSystem() {
  const streakCount = 320;
  const positions = new Float32Array(streakCount * 2 * 3);
  const ends = new Float32Array(streakCount * 2);
  const seeds = new Float32Array(streakCount * 2);
  const rng = createRng(9911);

  for (let i = 0; i < streakCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 4.6 + rng() * 19.0;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * 0.72;
    const z = -4.0 - rng() * 52.0;
    const seed = rng();

    positions[i * 6] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = y;
    positions[i * 6 + 5] = z;

    ends[i * 2] = 0;
    ends[i * 2 + 1] = 1;
    seeds[i * 2] = seed;
    seeds[i * 2 + 1] = seed;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uWarp: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aEnd;
      attribute float aSeed;
      uniform float uWarp;
      uniform float uTime;
      varying float vEnd;
      varying float vWarp;

      void main() {
        vEnd = aEnd;
        vWarp = uWarp;
        vec3 pos = position;
        float cycle = fract(aSeed + uTime * (0.4 + uWarp * 2.2));
        float zHead = mix(-4.0, -56.0, cycle);
        float streakLen = uWarp * (6.0 + aSeed * 12.0);
        pos.z = zHead + (1.0 - aEnd) * streakLen;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vEnd;
      varying float vWarp;

      void main() {
        if (vWarp < 0.02) discard;
        vec3 col = mix(vec3(0.55, 0.78, 1.0), vec3(1.0, 0.97, 0.9), vEnd);
        float alpha = vWarp * smoothstep(0.0, 0.85, vEnd) * 0.82;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 5;

  return {
    lines,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Creates a zero-allocation, single-draw-call distant falling meteorite system.
 * Uses tapered glowing quad ribbons positioned far in the background (z = -92..-142)
 * so streaks flare and fall gracefully across deep space without obscuring foreground UI.
 */
export function createBackgroundMeteorSystem() {
  const count = 7;
  const vertCount = count * 4;
  const idxCount = count * 6;

  const positions = new Float32Array(vertCount * 3); // base placeholder (0)
  const origins = new Float32Array(vertCount * 3);
  const dirs = new Float32Array(vertCount * 3);
  const corners = new Float32Array(vertCount * 2); // x: 0=head, 1=tail | y: -1..+1 side
  const seeds = new Float32Array(vertCount);
  const speeds = new Float32Array(vertCount);
  const lengths = new Float32Array(vertCount);
  const colors = new Float32Array(vertCount * 3);
  const indices = new Uint16Array(idxCount);

  const rng = createRng(314159);
  const palette = [
    new THREE.Color('#fff1d0'),
    new THREE.Color('#b6ddff'),
    new THREE.Color('#ffd3b6'),
    new THREE.Color('#d8ccff'),
  ];

  for (let i = 0; i < count; i++) {
    const ox = -18 + rng() * 116;
    const oy = 18 + rng() * 38;
    const oz = -100 - rng() * 44;

    // Unified gentle diagonal downward-left shower direction
    const dx = -(0.66 + rng() * 0.16);
    const dy = -(0.60 + rng() * 0.16);
    const dz = (rng() - 0.5) * 0.08;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ndx = dx / len;
    const ndy = dy / len;
    const ndz = dz / len;

    const seed = ((i / count) + rng() * 0.07) % 1;
    const speed = 0.075 + rng() * 0.045;
    const streakLen = 13 + rng() * 10;
    const col = palette[Math.floor(rng() * palette.length)];

    const cornerCoords = [
      [0, -1],
      [0, 1],
      [1, 1],
      [1, -1],
    ];

    for (let v = 0; v < 4; v++) {
      const vi = i * 4 + v;
      origins[vi * 3] = ox;
      origins[vi * 3 + 1] = oy;
      origins[vi * 3 + 2] = oz;

      dirs[vi * 3] = ndx;
      dirs[vi * 3 + 1] = ndy;
      dirs[vi * 3 + 2] = ndz;

      corners[vi * 2] = cornerCoords[v][0];
      corners[vi * 2 + 1] = cornerCoords[v][1];

      seeds[vi] = seed;
      speeds[vi] = speed;
      lengths[vi] = streakLen;

      colors[vi * 3] = col.r;
      colors[vi * 3 + 1] = col.g;
      colors[vi * 3 + 2] = col.b;
    }

    const baseV = i * 4;
    const ii = i * 6;
    indices[ii] = baseV;
    indices[ii + 1] = baseV + 1;
    indices[ii + 2] = baseV + 2;
    indices[ii + 3] = baseV;
    indices[ii + 4] = baseV + 2;
    indices[ii + 5] = baseV + 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3));
  geometry.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aLength', new THREE.BufferAttribute(lengths, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHoverMix: { value: 0 },
      uReducedMotion: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aOrigin;
      attribute vec3 aDir;
      attribute vec2 aCorner;
      attribute float aSeed;
      attribute float aSpeed;
      attribute float aLength;
      attribute vec3 aColor;

      uniform float uTime;
      uniform float uHoverMix;
      uniform float uReducedMotion;

      varying float vAlong;
      varying float vSide;
      varying float vFade;
      varying vec3 vColor;

      void main() {
        if (uReducedMotion > 0.5) {
          vFade = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

        float cycle = fract(aSeed + uTime * aSpeed);
        float activeWindow = 0.28;
        if (cycle >= activeWindow) {
          vFade = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

        float u = cycle / activeWindow;
        float envelope = smoothstep(0.0, 0.16, u) * (1.0 - smoothstep(0.68, 1.0, u));
        float travelDist = 42.0 + aSeed * 14.0;

        vec3 head = aOrigin + aDir * (u * travelDist);
        float curLen = aLength * (0.45 + 0.55 * sin(u * 3.14159));
        vec3 tail = head - aDir * curLen;

        vec3 worldPos = mix(head, tail, aCorner.x);

        // Perpendicular ribbon width in XY view plane, tapering from glowing head to razor tail
        vec2 dirXY = normalize(aDir.xy + vec2(0.0001));
        vec2 perp = vec2(-dirXY.y, dirXY.x);
        float halfWidth = mix(0.62, 0.08, aCorner.x);
        worldPos.xy += perp * aCorner.y * halfWidth;

        vAlong = aCorner.x;
        vSide = aCorner.y;
        vFade = envelope * (1.0 - uHoverMix * 0.55);
        vColor = aColor;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlong;
      varying float vSide;
      varying float vFade;
      varying vec3 vColor;

      void main() {
        if (vFade <= 0.01) discard;

        // Soft transverse beam glow + bright luminous meteorite head + tapering ionized tail
        float radial = exp(-vSide * vSide * 5.5);
        float headFlare = exp(-vAlong * 10.5) * 1.85;
        float tailGlow = pow(max(0.0, 1.0 - vAlong), 2.15) * 0.85;

        float intensity = (headFlare + tailGlow) * radial * vFade;
        if (intensity < 0.01) discard;

        vec3 coreWhite = vec3(1.0, 0.98, 0.93);
        vec3 col = mix(vColor, coreWhite, clamp(headFlare * 0.65, 0.0, 1.0));
        gl_FragColor = vec4(col * (0.85 + headFlare * 0.7), clamp(intensity, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;

  return {
    mesh,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

