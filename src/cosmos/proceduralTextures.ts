import * as THREE from 'three';

/**
 * Generates a 512x512 2x2 texture atlas of 4 distinct, crisp celestial star sprites.
 * Each tile keeps its rays well inside the inscribed circle so rotation never clips.
 */
export function createStarAtlasTexture(): THREE.CanvasTexture {
  const size = 512;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const drawGlow = (cx: number, cy: number, radius: number, inner: string, mid: string) => {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.22, mid);
    grad.addColorStop(0.55, 'rgba(170, 198, 255, 0.14)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawRay = (cx: number, cy: number, length: number, width: number, angle: number, alpha: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(-length, 0, length, 0);
    grad.addColorStop(0, 'rgba(255, 252, 245, 0)');
    grad.addColorStop(0.35, `rgba(235, 244, 255, ${alpha * 0.45})`);
    grad.addColorStop(0.5, `rgba(255, 252, 248, ${alpha})`);
    grad.addColorStop(0.65, `rgba(235, 244, 255, ${alpha * 0.45})`);
    grad.addColorStop(1, 'rgba(255, 252, 245, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, length, width, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Tile (0, 0): Classic 4-point diamond starburst
  {
    const cx = half * 0.5;
    const cy = half * 0.5;
    drawGlow(cx, cy, 78, 'rgba(255, 253, 246, 1)', 'rgba(235, 242, 255, 0.55)');
    drawRay(cx, cy, 94, 3.2, 0, 0.92);
    drawRay(cx, cy, 94, 3.2, Math.PI / 2, 0.92);
  }

  // Tile (1, 0): 8-ray celestial compass star (bright core + diagonal accents)
  {
    const cx = half * 1.5;
    const cy = half * 0.5;
    drawGlow(cx, cy, 74, 'rgba(255, 248, 226, 1)', 'rgba(255, 224, 168, 0.48)');
    drawRay(cx, cy, 88, 2.8, 0, 0.85);
    drawRay(cx, cy, 88, 2.8, Math.PI / 2, 0.85);
    drawRay(cx, cy, 56, 2.0, Math.PI / 4, 0.45);
    drawRay(cx, cy, 56, 2.0, -Math.PI / 4, 0.45);
  }

  // Tile (0, 1): 6-point stellar crystal
  {
    const cx = half * 0.5;
    const cy = half * 1.5;
    drawGlow(cx, cy, 72, 'rgba(246, 251, 255, 1)', 'rgba(186, 216, 255, 0.5)');
    for (let i = 0; i < 3; i++) {
      drawRay(cx, cy, 84, 2.4, (i * Math.PI) / 3, 0.72);
    }
  }

  // Tile (1, 1): Radiant pinpoint nova orb
  {
    const cx = half * 1.5;
    const cy = half * 1.5;
    drawGlow(cx, cy, 68, 'rgba(255, 252, 244, 1)', 'rgba(226, 212, 255, 0.48)');
    drawRay(cx, cy, 62, 2.2, 0.3, 0.5);
    drawRay(cx, cy, 62, 2.2, 0.3 + Math.PI / 2, 0.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a 512x512 2x2 atlas of cosmic nebula wisps & mini spiral/stardust clouds
 * that sit deeper along the galactic arms.
 */
export function createCosmosClusterAtlasTexture(): THREE.CanvasTexture {
  const size = 512;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const drawCloud = (cx: number, cy: number, r: number, c1: string, c2: string) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, c1);
    g.addColorStop(0.45, c2);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // Tile (0,0): Asymmetric interstellar dust cloud
  {
    const cx = half * 0.5;
    const cy = half * 0.5;
    drawCloud(cx - 14, cy - 8, 86, 'rgba(175, 198, 245, 0.28)', 'rgba(72, 102, 178, 0.09)');
    drawCloud(cx + 18, cy + 12, 68, 'rgba(205, 218, 252, 0.22)', 'rgba(84, 114, 192, 0.06)');
    drawCloud(cx + 4, cy - 18, 48, 'rgba(220, 230, 255, 0.16)', 'rgba(92, 122, 198, 0.04)');
  }

  // Tile (1,0): Violet-rose cosmic dust veil
  {
    const cx = half * 1.5;
    const cy = half * 0.5;
    drawCloud(cx - 16, cy - 10, 74, 'rgba(192, 165, 245, 0.35)', 'rgba(110, 78, 175, 0.12)');
    drawCloud(cx + 22, cy + 14, 64, 'rgba(235, 178, 205, 0.28)', 'rgba(145, 86, 132, 0.08)');
  }

  // Tile (0,1): Teal-cyan ionized gas wisp
  {
    const cx = half * 0.5;
    const cy = half * 1.5;
    drawCloud(cx, cy, 86, 'rgba(160, 222, 242, 0.36)', 'rgba(58, 132, 175, 0.12)');
    drawCloud(cx + 18, cy - 18, 52, 'rgba(220, 248, 255, 0.25)', 'rgba(80, 165, 205, 0.06)');
  }

  // Tile (1,1): Warm golden stellar nursery cloud
  {
    const cx = half * 1.5;
    const cy = half * 1.5;
    drawCloud(cx, cy, 84, 'rgba(255, 226, 176, 0.34)', 'rgba(180, 128, 72, 0.12)');
    drawCloud(cx - 14, cy + 12, 46, 'rgba(255, 244, 214, 0.32)', 'rgba(210, 160, 96, 0.06)');
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates an ultra-soft circular galactic core glow texture.
 */
export function createNebulaWispTexture(): THREE.CanvasTexture {
  const size = 256;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255, 248, 232, 0.85)');
  grad.addColorStop(0.25, 'rgba(206, 222, 255, 0.38)');
  grad.addColorStop(0.62, 'rgba(128, 152, 220, 0.1)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Soft Gaussian dot for foreground drifting cosmic stardust.
 */
export function createDustTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255, 252, 245, 1)');
  grad.addColorStop(0.24, 'rgba(225, 234, 255, 0.5)');
  grad.addColorStop(0.6, 'rgba(160, 185, 240, 0.12)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Volumetric cosmic starlight ray sprite texture.
 */
export function createLightRayTexture(): THREE.CanvasTexture {
  const width = 256;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const horiz = ctx.createLinearGradient(0, 0, width, 0);
  horiz.addColorStop(0, 'rgba(180, 210, 255, 0)');
  horiz.addColorStop(0.32, 'rgba(195, 218, 255, 0.14)');
  horiz.addColorStop(0.5, 'rgba(245, 239, 226, 0.3)');
  horiz.addColorStop(0.68, 'rgba(195, 218, 255, 0.14)');
  horiz.addColorStop(1, 'rgba(180, 210, 255, 0)');
  ctx.fillStyle = horiz;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'destination-in';
  const vert = ctx.createLinearGradient(0, 0, 0, height);
  vert.addColorStop(0, 'rgba(0,0,0,0)');
  vert.addColorStop(0.25, 'rgba(0,0,0,0.85)');
  vert.addColorStop(0.75, 'rgba(0,0,0,0.45)');
  vert.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vert;
  ctx.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
