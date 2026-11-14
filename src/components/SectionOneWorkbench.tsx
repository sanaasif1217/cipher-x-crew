/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  computeStarObservationReadout,
  matchKnownStarByCoords,
  parseDecToDegrees,
  parseRaToDegrees,
  REAL_STAR_CATALOG,
  type RealStarId,
  type StarCatalogEntry,
} from '../data/starExploreCatalog';
import {
  computeBarnardPosition,
  computeEpsilonIndiOrbit,
  computeRDraconisPulsation,
  computeRwAurigaeOccultation,
  computeWise0855Position,
  createRng,
} from '../cosmos/cosmosMath';

export type SpectralBand = 'optical' | 'nir' | 'mir';

export interface CustomSkyPatch {
  ra: string;
  dec: string;
  raDeg: number;
  decDeg: number;
}

interface SectionOneWorkbenchProps {
  selectedStarId: RealStarId | 'custom';
  customPatch: CustomSkyPatch | null;
  selectionNonce: number;
  onSelectStar: (starId: RealStarId) => void;
  onApplyCustomCoords: (patch: CustomSkyPatch, matchedStarId: RealStarId | null) => void;
}

const LOOP_SECONDS_BY_TYPE: Record<StarCatalogEntry['simulationType'], number> = {
  drift: 10,
  binary: 8,
  infrared: 9,
  'variable-dip': 12,
  pulsation: 10,
};

const REFERENCE_FIELD_STARS = [
  { x: 0.13, y: 0.18, r: 1.4, a: 0.58 },
  { x: 0.25, y: 0.82, r: 1.7, a: 0.65 },
  { x: 0.77, y: 0.21, r: 1.5, a: 0.52 },
  { x: 0.89, y: 0.74, r: 1.9, a: 0.7 },
  { x: 0.55, y: 0.13, r: 1.2, a: 0.5 },
  { x: 0.68, y: 0.63, r: 1.5, a: 0.56 },
  { x: 0.42, y: 0.85, r: 1.1, a: 0.45 },
  { x: 0.91, y: 0.35, r: 1.3, a: 0.5 },
  { x: 0.08, y: 0.54, r: 1.4, a: 0.48 },
  { x: 0.61, y: 0.38, r: 1.2, a: 0.42 },
];

export function SectionOneWorkbench({
  selectedStarId,
  customPatch,
  selectionNonce,
  onSelectStar,
  onApplyCustomCoords,
}: SectionOneWorkbenchProps) {
  const activeStar =
    selectedStarId !== 'custom'
      ? REAL_STAR_CATALOG.find((s) => s.id === selectedStarId) ?? REAL_STAR_CATALOG[0]
      : null;

  const [raInput, setRaInput] = useState<string>(
    activeStar ? activeStar.coordinates.ra : customPatch?.ra ?? REAL_STAR_CATALOG[0].coordinates.ra,
  );
  const [decInput, setDecInput] = useState<string>(
    activeStar ? activeStar.coordinates.dec : customPatch?.dec ?? REAL_STAR_CATALOG[0].coordinates.dec,
  );
  const [coordError, setCoordError] = useState<string | null>(null);
  const [coordStatus, setCoordStatus] = useState<string | null>(null);

  // Right-side viewer controls applied to the center big picture
  const [isPlaying, setIsPlaying] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [spectralBand, setSpectralBand] = useState<SpectralBand>('optical');
  const [blinkCompare, setBlinkCompare] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showTrail, setShowTrail] = useState<boolean>(true);
  const [contrastStretch, setContrastStretch] = useState<number>(1.15);
  const [displayTime, setDisplayTime] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backdropImgRef = useRef<HTMLImageElement | null>(null);
  const simTimeRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const lastUiSyncRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // Autofill coordinates & reset epoch when target changes from Sector 02 or selector
  useEffect(() => {
    if (activeStar) {
      setRaInput(activeStar.coordinates.ra);
      setDecInput(activeStar.coordinates.dec);
      setCoordError(null);
      simTimeRef.current = activeStar.simulationType === 'variable-dip' ? 2.5 : 0;
      setDisplayTime(simTimeRef.current);
      if (selectionNonce > 0) {
        setCoordStatus(`Loaded ${activeStar.name} sky patch`);
      }
    } else if (customPatch) {
      setRaInput(customPatch.ra);
      setDecInput(customPatch.dec);
      setCoordError(null);
      simTimeRef.current = 0;
      setDisplayTime(0);
      setCoordStatus(`Centered at custom patch (${customPatch.ra}, ${customPatch.dec})`);
    }
  }, [selectedStarId, customPatch?.ra, customPatch?.dec, selectionNonce]);

  // Clear status notice gently after 4 seconds
  useEffect(() => {
    if (!coordStatus) return;
    const id = window.setTimeout(() => setCoordStatus(null), 4000);
    return () => window.clearTimeout(id);
  }, [coordStatus]);

  // Load hyper-realistic star backdrop image
  useEffect(() => {
    if (!activeStar) {
      backdropImgRef.current = null;
      return;
    }
    const img = new Image();
    img.src = activeStar.imageSrc;
    img.onload = () => {
      backdropImgRef.current = img;
    };
    backdropImgRef.current = img.complete ? img : null;
  }, [activeStar?.imageSrc]);

  const handleCoordSubmit = (e: FormEvent) => {
    e.preventDefault();
    const raDeg = parseRaToDegrees(raInput);
    const decDeg = parseDecToDegrees(decInput);

    if (raDeg === null) {
      setCoordError('Enter a valid Right Ascension (e.g. 08h 55m 10.831s or 133.795).');
      return;
    }
    if (decDeg === null) {
      setCoordError('Enter a valid Declination between -90° and +90° (e.g. -07° 14′ 42.53″ or -7.245).');
      return;
    }

    setCoordError(null);
    const matched = matchKnownStarByCoords(raDeg, decDeg);
    onApplyCustomCoords(
      {
        ra: raInput.trim(),
        dec: decInput.trim(),
        raDeg,
        decDeg,
      },
      matched,
    );
  };

  const loopDuration = activeStar ? LOOP_SECONDS_BY_TYPE[activeStar.simulationType] : 10;

  const handleStepEpoch = (direction: -1 | 1) => {
    setIsPlaying(false);
    const step = loopDuration / 6;
    const next = (simTimeRef.current + direction * step + loopDuration) % loopDuration;
    simTimeRef.current = next;
    setDisplayTime(next);
  };

  const drawOpticalSpike = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    len: number,
    alpha: number,
    tint: string,
  ) => {
    ctx.save();
    ctx.strokeStyle = tint;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx - len, cy);
    ctx.lineTo(cx + len, cy);
    ctx.moveTo(cx, cy - len);
    ctx.lineTo(cx, cy + len);
    ctx.stroke();
    ctx.restore();
  };

  const renderSkyPicture = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, t: number) => {
      ctx.clearRect(0, 0, width, height);

      // Deep space background tinted by active spectral band
      ctx.fillStyle =
        spectralBand === 'nir'
          ? '#040812'
          : spectralBand === 'mir'
            ? '#0c0604'
            : '#03050c';
      ctx.fillRect(0, 0, width, height);

      // Blend hyper-realistic astrophotography image if a benchmark star is active
      const bgImg = backdropImgRef.current;
      const stretchAlphaBoost = Math.min(0.68, 0.24 + (contrastStretch - 1) * 0.24);
      if (activeStar && bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = stretchAlphaBoost;
        if (spectralBand === 'nir') {
          ctx.filter = `contrast(${(contrastStretch * 1.12).toFixed(2)}) saturate(0.45) brightness(0.95)`;
        } else if (spectralBand === 'mir') {
          ctx.filter = `contrast(${(contrastStretch * 1.18).toFixed(2)}) sepia(0.55) hue-rotate(-14deg)`;
        } else {
          ctx.filter = `contrast(${contrastStretch.toFixed(2)})`;
        }
        const scale = Math.max(width / bgImg.naturalWidth, height / bgImg.naturalHeight);
        const drawW = bgImg.naturalWidth * scale;
        const drawH = bgImg.naturalHeight * scale;
        ctx.drawImage(bgImg, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
        ctx.restore();
      } else if (customPatch) {
        // Deterministic starfield mosaic for arbitrary user RA/Dec coordinates
        const seed = Math.abs(Math.round(customPatch.raDeg * 1000 + customPatch.decDeg * 733)) + 17;
        const rng = createRng(seed);
        for (let i = 0; i < 150; i++) {
          const sx = rng() * width;
          const sy = rng() * height;
          const sr = 0.5 + rng() * 1.6;
          const sa = Math.min(1, (0.2 + rng() * 0.7) * contrastStretch * 0.85);
          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.fillStyle =
            spectralBand === 'mir'
              ? `rgba(255, 205, 165, ${sa})`
              : `rgba(245, 239, 226, ${sa})`;
          ctx.fill();
        }
      }

      // Vignette for astrometric contrast
      const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        width * 0.1,
        width * 0.5,
        height * 0.5,
        width * 0.72,
      );
      vignette.addColorStop(0, 'rgba(3, 5, 12, 0.14)');
      vignette.addColorStop(1, 'rgba(2, 3, 9, 0.78)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      // Optional RA/Dec coordinate grid
      if (showGrid) {
        ctx.strokeStyle =
          spectralBand === 'mir'
            ? 'rgba(255, 210, 175, 0.11)'
            : 'rgba(245, 239, 226, 0.09)';
        ctx.lineWidth = 1;
        const stepX = width / 10;
        const stepY = height / 6;
        for (let x = stepX; x < width; x += stepX) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = stepY; y < height; y += stepY) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        // Scale bar (lower right)
        const barW = 72;
        const bx = width - barW - 22;
        const by = height - 22;
        ctx.strokeStyle = 'rgba(245, 239, 226, 0.65)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bx, by - 4);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + barW, by);
        ctx.lineTo(bx + barW, by - 4);
        ctx.stroke();
        ctx.fillStyle = 'rgba(245, 239, 226, 0.76)';
        ctx.font = '500 10px Manrope, sans-serif';
        ctx.fillText('1.0 ARCMIN', bx + 8, by - 7);
      }

      // Stationary background reference stars
      for (const ref of REFERENCE_FIELD_STARS) {
        ctx.beginPath();
        ctx.arc(width * ref.x, height * ref.y, ref.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245, 239, 226, ${Math.min(1, ref.a * contrastStretch * 0.85)})`;
        ctx.fill();
      }

      // Blink compare cadence: flashes baseline vs current epoch every 0.45s
      const blinkShowBaseline = blinkCompare && Math.floor(t * 2.2) % 2 === 1;

      const starColorCore =
        spectralBand === 'mir' ? '#ffd9b8' : spectralBand === 'nir' ? '#eef4ff' : '#ffffff';
      const starColorHalo =
        spectralBand === 'mir'
          ? 'rgba(255, 145, 72, 0.72)'
          : spectralBand === 'nir'
            ? 'rgba(215, 228, 255, 0.65)'
            : 'rgba(255, 155, 112, 0.72)';

      if (!activeStar && customPatch) {
        // Custom Sky Patch subtle proper-motion candidate marker
        const prog = ((t % 10) + 10) % 10 / 10;
        const startX = width * 0.44;
        const startY = height * 0.56;
        const targetX = startX + prog * (width * 0.14);
        const targetY = startY - prog * (height * 0.12);
        const drawX = blinkShowBaseline ? startX : targetX;
        const drawY = blinkShowBaseline ? startY : targetY;

        if (showTrail) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(targetX, targetY);
          ctx.strokeStyle = 'rgba(245, 239, 226, 0.55)';
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.restore();
        }

        const glow = ctx.createRadialGradient(drawX, drawY, 1, drawX, drawY, 26 * contrastStretch);
        glow.addColorStop(0, starColorCore);
        glow.addColorStop(0.35, starColorHalo);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(drawX, drawY, 26 * contrastStretch, 0, Math.PI * 2);
        ctx.fill();
        drawOpticalSpike(ctx, drawX, drawY, 16, 0.55, starColorCore);
        ctx.strokeStyle = 'rgba(245, 239, 226, 0.75)';
        ctx.strokeRect(drawX - 16, drawY - 16, 32, 32);
        return;
      }

      if (!activeStar) return;

      if (activeStar.simulationType === 'drift') {
        const pos = computeBarnardPosition(t, 1);
        const startX = width * 0.2;
        const startY = height * 0.75;
        const curX = blinkShowBaseline ? startX : width * pos.x;
        const curY = blinkShowBaseline ? startY : height * pos.y;

        if (showTrail) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(startX, startY, 10, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 239, 226, 0.55)';
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.fillStyle = 'rgba(245, 239, 226, 0.85)';
          ctx.font = '500 10px Manrope, sans-serif';
          ctx.fillText('EPOCH 2026', startX - 28, startY + 24);

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(width * pos.x, height * pos.y);
          ctx.strokeStyle = 'rgba(255, 198, 165, 0.8)';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.restore();
        }

        const glowR = 34 * contrastStretch;
        const glow = ctx.createRadialGradient(curX, curY, 1, curX, curY, glowR);
        glow.addColorStop(0, starColorCore);
        glow.addColorStop(0.28, starColorHalo);
        glow.addColorStop(0.68, 'rgba(205, 65, 45, 0.25)');
        glow.addColorStop(1, 'rgba(205, 65, 45, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(curX, curY, glowR, 0, Math.PI * 2);
        ctx.fill();
        drawOpticalSpike(ctx, curX, curY, 20, 0.6, starColorCore);

        ctx.beginPath();
        ctx.arc(curX, curY, 4.8, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.strokeStyle = 'rgba(245, 239, 226, 0.78)';
        ctx.lineWidth = 1;
        ctx.strokeRect(curX - 16, curY - 16, 32, 32);
      } else if (activeStar.simulationType === 'binary') {
        const orbit = computeEpsilonIndiOrbit(blinkShowBaseline ? 0 : t, 1);
        const hostX = width * 0.14;
        const hostY = height * 0.22;

        const hostGlow = ctx.createRadialGradient(hostX, hostY, 2, hostX, hostY, 48);
        hostGlow.addColorStop(0, 'rgba(255, 238, 198, 0.98)');
        hostGlow.addColorStop(0.32, 'rgba(240, 175, 95, 0.42)');
        hostGlow.addColorStop(1, 'rgba(240, 175, 95, 0)');
        ctx.fillStyle = hostGlow;
        ctx.beginPath();
        ctx.arc(hostX, hostY, 48, 0, Math.PI * 2);
        ctx.fill();
        drawOpticalSpike(ctx, hostX, hostY, 24, 0.48, starColorCore);
        ctx.fillStyle = '#fff9ed';
        ctx.beginPath();
        ctx.arc(hostX, hostY, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(245, 239, 226, 0.85)';
        ctx.font = '500 10px Manrope, sans-serif';
        ctx.fillText('Host: Epsilon Indi A', hostX + 14, hostY + 4);

        const cx = width * 0.58;
        const cy = height * 0.52;

        if (showTrail) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(cx, cy, width * 0.19, height * 0.22, 0.18, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 239, 226, 0.26)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.restore();
        }

        ctx.strokeStyle = 'rgba(245, 239, 226, 0.48)';
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy);
        ctx.lineTo(cx + 6, cy);
        ctx.moveTo(cx, cy - 6);
        ctx.lineTo(cx, cy + 6);
        ctx.stroke();

        const bax = cx + (orbit.ba.x - 0.5) * width;
        const bay = cy + (orbit.ba.y - 0.5) * height;
        const bbx = cx + (orbit.bb.x - 0.5) * width;
        const bby = cy + (orbit.bb.y - 0.5) * height;

        const baGlow = ctx.createRadialGradient(bax, bay, 1, bax, bay, 22 * contrastStretch);
        baGlow.addColorStop(0, 'rgba(255, 215, 175, 0.96)');
        baGlow.addColorStop(0.45, 'rgba(215, 115, 78, 0.52)');
        baGlow.addColorStop(1, 'rgba(215, 115, 78, 0)');
        ctx.fillStyle = baGlow;
        ctx.beginPath();
        ctx.arc(bax, bay, 22 * contrastStretch, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff3e8';
        ctx.beginPath();
        ctx.arc(bax, bay, 4.4, 0, Math.PI * 2);
        ctx.fill();

        const bbGlow = ctx.createRadialGradient(bbx, bby, 1, bbx, bby, 18 * contrastStretch);
        bbGlow.addColorStop(0, 'rgba(236, 220, 255, 0.94)');
        bbGlow.addColorStop(0.45, 'rgba(150, 110, 195, 0.48)');
        bbGlow.addColorStop(1, 'rgba(150, 110, 195, 0)');
        ctx.fillStyle = bbGlow;
        ctx.beginPath();
        ctx.arc(bbx, bby, 18 * contrastStretch, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f5eeff';
        ctx.beginPath();
        ctx.arc(bbx, bby, 3.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(245, 239, 226, 0.9)';
        ctx.font = '500 10px Manrope, sans-serif';
        ctx.fillText('Ba (T1V)', bax + 10, bay - 7);
        ctx.fillText('Bb (T6V)', bbx + 10, bby + 12);
      } else if (activeStar.simulationType === 'infrared') {
        const pos = computeWise0855Position(t, 1);
        const startX = width * 0.15;
        const startY = height * 0.35;
        const curX = blinkShowBaseline ? startX : width * pos.x;
        const curY = blinkShowBaseline ? startY : height * pos.y;

        if (showTrail) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(startX, startY, 9, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 239, 226, 0.5)';
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.fillStyle = 'rgba(245, 239, 226, 0.78)';
          ctx.font = '500 10px Manrope, sans-serif';
          ctx.fillText('DISCOVERY EPOCH', startX - 24, startY - 18);

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(width * pos.x, height * pos.y);
          ctx.strokeStyle = 'rgba(245, 239, 226, 0.58)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }

        const irBoost = spectralBand === 'mir' ? 1.32 : spectralBand === 'nir' ? 1.15 : 1;
        const glowR = 28 * contrastStretch * irBoost;
        const irGlow = ctx.createRadialGradient(curX, curY, 1, curX, curY, glowR);
        irGlow.addColorStop(0, starColorCore);
        irGlow.addColorStop(0.4, spectralBand === 'mir' ? 'rgba(255, 168, 95, 0.58)' : 'rgba(185, 145, 220, 0.48)');
        irGlow.addColorStop(1, 'rgba(120, 80, 180, 0)');
        ctx.fillStyle = irGlow;
        ctx.beginPath();
        ctx.arc(curX, curY, glowR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(curX, curY, 4.0 * irBoost, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(245, 239, 226, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(curX - 16, curY - 16, 32, 32);
      } else if (activeStar.simulationType === 'variable-dip') {
        const rw = computeRwAurigaeOccultation(blinkShowBaseline ? 0 : t, 1);
        const ax = width * 0.36;
        const ay = height * 0.33;
        const bx = width * 0.65;
        const by = height * 0.28;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.bezierCurveTo(
          width * 0.45,
          height * (0.14 + rw.occultationFactor * 0.18),
          width * 0.55,
          height * (0.44 + rw.occultationFactor * 0.15),
          bx,
          by,
        );
        ctx.strokeStyle = `rgba(240, 182, 108, ${0.38 + rw.streamDensity * 0.52})`;
        ctx.lineWidth = 10 * rw.streamDensity;
        ctx.stroke();
        ctx.restore();

        const dimFactor = 1 - rw.occultationFactor * 0.64;
        const aGlow = ctx.createRadialGradient(ax, ay, 1, ax, ay, 32 * dimFactor * contrastStretch);
        aGlow.addColorStop(0, `rgba(255, 245, 220, ${dimFactor})`);
        aGlow.addColorStop(0.5, `rgba(240, 165, 85, ${dimFactor * 0.5})`);
        aGlow.addColorStop(1, 'rgba(240, 165, 85, 0)');
        ctx.fillStyle = aGlow;
        ctx.beginPath();
        ctx.arc(ax, ay, 32 * dimFactor * contrastStretch, 0, Math.PI * 2);
        ctx.fill();
        drawOpticalSpike(ctx, ax, ay, 18 * dimFactor, dimFactor * 0.62, starColorCore);

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ax, ay, 4.6 * dimFactor, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(245, 200, 130, 0.48)';
        ctx.beginPath();
        ctx.arc(bx, by, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff5e6';
        ctx.beginPath();
        ctx.arc(bx, by, 3.4, 0, Math.PI * 2);
        ctx.fill();

        // Photometric Light Curve strip
        const gx0 = 24;
        const gw = width - 48;
        const gy0 = height * 0.72;
        const gh = height * 0.21;
        ctx.fillStyle = 'rgba(245, 239, 226, 0.76)';
        ctx.font = '500 10px Manrope, sans-serif';
        ctx.fillText('LIGHT CURVE · 4.0 MAG OCCULTATION DIP', gx0, gy0 - 7);

        ctx.fillStyle = 'rgba(4, 6, 14, 0.82)';
        ctx.fillRect(gx0, gy0, gw, gh);
        ctx.strokeStyle = 'rgba(245, 239, 226, 0.24)';
        ctx.strokeRect(gx0, gy0, gw, gh);

        ctx.beginPath();
        ctx.strokeStyle = '#f5efe2';
        ctx.lineWidth = 1.6;
        for (let i = 0; i <= gw; i += 3) {
          const p = i / gw;
          const dip = p >= 0.3 && p <= 0.7 ? Math.sin(((p - 0.3) / 0.4) * Math.PI) : 0;
          const py = gy0 + 10 + dip * (gh - 20);
          if (i === 0) ctx.moveTo(gx0 + i, py);
          else ctx.lineTo(gx0 + i, py);
        }
        ctx.stroke();

        const phase = ((t % 12) + 12) % 12 / 12;
        const scanX = gx0 + phase * gw;
        ctx.strokeStyle = '#ffb88c';
        ctx.beginPath();
        ctx.moveTo(scanX, gy0);
        ctx.lineTo(scanX, gy0 + gh);
        ctx.stroke();
      } else if (activeStar.simulationType === 'pulsation') {
        const rd = computeRDraconisPulsation(blinkShowBaseline ? 0 : t, 1);
        const cx = width * 0.5;
        const cy = height * 0.35;
        const r = 24 * rd.radiusScale;

        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(cx, cy, r + (i + 1) * 9 * rd.radiusScale, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 160, 118, ${0.28 / (i + 1)})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }

        if (showTrail) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, 24, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 239, 226, 0.42)';
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.restore();
        }

        const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, r * 1.65 * contrastStretch);
        glow.addColorStop(0, '#fff7f0');
        glow.addColorStop(0.38, 'rgba(255, 152, 92, 0.92)');
        glow.addColorStop(0.74, 'rgba(205, 58, 42, 0.65)');
        glow.addColorStop(1, 'rgba(150, 22, 20, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.65 * contrastStretch, 0, Math.PI * 2);
        ctx.fill();
        drawOpticalSpike(ctx, cx, cy, r * 1.18, 0.5, starColorCore);

        const gx0 = 24;
        const gw = width - 48;
        const gy0 = height * 0.72;
        const gh = height * 0.21;
        ctx.fillStyle = 'rgba(245, 239, 226, 0.76)';
        ctx.font = '500 10px Manrope, sans-serif';
        ctx.fillText('245.6-DAY MIRA PULSATION CURVE · 6.7 ↔ 13.2 MAG', gx0, gy0 - 7);

        ctx.fillStyle = 'rgba(4, 6, 14, 0.82)';
        ctx.fillRect(gx0, gy0, gw, gh);
        ctx.strokeStyle = 'rgba(245, 239, 226, 0.24)';
        ctx.strokeRect(gx0, gy0, gw, gh);

        ctx.beginPath();
        ctx.strokeStyle = '#f5efe2';
        ctx.lineWidth = 1.6;
        for (let i = 0; i <= gw; i += 3) {
          const p = i / gw;
          const osc = Math.sin(p * Math.PI * 2);
          const py = gy0 + gh * 0.5 - osc * (gh * 0.36);
          if (i === 0) ctx.moveTo(gx0 + i, py);
          else ctx.lineTo(gx0 + i, py);
        }
        ctx.stroke();

        const phase = ((t % 10) + 10) % 10 / 10;
        const scanX = gx0 + phase * gw;
        ctx.strokeStyle = '#ffb88c';
        ctx.beginPath();
        ctx.moveTo(scanX, gy0);
        ctx.lineTo(scanX, gy0 + gh);
        ctx.stroke();
      }
    },
    [activeStar, customPatch, spectralBand, blinkCompare, showGrid, showTrail, contrastStretch],
  );

  // Main animation loop for center big picture
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let mounted = true;

    const tick = (now: number) => {
      if (!mounted) return;
      if (!lastFrameTimeRef.current) lastFrameTimeRef.current = now;
      const dt = Math.min(0.08, (now - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = now;

      if (isPlaying) {
        simTimeRef.current = (simTimeRef.current + dt * speedMultiplier) % loopDuration;
      }

      renderSkyPicture(ctx, canvas.width, canvas.height, simTimeRef.current);

      if (now - lastUiSyncRef.current > 66) {
        lastUiSyncRef.current = now;
        setDisplayTime(simTimeRef.current);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, speedMultiplier, loopDuration, renderSkyPicture]);

  const readout = activeStar
    ? computeStarObservationReadout(activeStar.id, displayTime, 1)
    : {
        epochLabel: `PASS ${Math.floor((displayTime / loopDuration) * 6) + 1} / 6`,
        primaryMetricLabel: 'Patch Center',
        primaryMetricValue: customPatch ? `${customPatch.raDeg.toFixed(2)}°` : '—',
        secondaryMetricLabel: 'Declination',
        secondaryMetricValue: customPatch ? `${customPatch.decDeg.toFixed(2)}°` : '—',
      };

  const bandLabel =
    spectralBand === 'optical' ? (
      'OPTICAL + IR'
    ) : spectralBand === 'nir' ? (
      <>
        NEAR-IR 1–2 <span className="s1-unit">µm</span>
      </>
    ) : (
      <>
        MID-IR 3–5 <span className="s1-unit">µm</span>
      </>
    );

  return (
    <div className="s1-workbench">
      {/* Header Row */}
      <div className="s1-header">
        <div>
          <p className="dest-kicker">Section 01 · SPHEREx Sky Time-Lapse</p>
          <h2 id="work-heading" className="s1-title">
            Coordinate &amp; Motion Observatory
          </h2>
        </div>
        <p className="s1-lead">
          Enter Right Ascension and Declination or pick a benchmark star to watch SPHEREx multi-epoch sky imagery change over time.
        </p>
      </div>

      {/* Symmetrical 3-Column Observatory: Left Controls | Big Picture | Right Controls */}
      <div className="s1-deck">
        {/* LEFT CONTROLS: Target Selection & Two Coordinate Inputs */}
        <aside className="s1-panel s1-panel--left" aria-label="Star selection and coordinate inputs">
          <div className="s1-block">
            <label htmlFor="s1-star-select" className="s1-label">
              Select Star
            </label>
            <select
              id="s1-star-select"
              className="s1-select"
              value={selectedStarId}
              onChange={(e) => {
                const val = e.target.value;
                if (val !== 'custom') {
                  onSelectStar(val as RealStarId);
                }
              }}
            >
              {REAL_STAR_CATALOG.map((star) => (
                <option key={star.id} value={star.id}>
                  {star.name}
                </option>
              ))}
              {selectedStarId === 'custom' && <option value="custom">Custom Sky Patch</option>}
            </select>

            <div className="s1-star-pills" role="group" aria-label="Quick target stars">
              {REAL_STAR_CATALOG.map((star) => {
                const isSelected = selectedStarId === star.id;
                return (
                  <button
                    key={star.id}
                    type="button"
                    className={`s1-star-btn${isSelected ? ' is-active' : ''}`}
                    onClick={() => onSelectStar(star.id)}
                  >
                    <span>{star.shortName}</span>
                    <span className="s1-star-btn-meta">{star.category}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleCoordSubmit} className="s1-block s1-coord-form">
            <p className="s1-label">Sky Coordinates (2 Data Points)</p>
            <div className="s1-field">
              <label htmlFor="s1-ra-input" className="s1-field-k">
                Right Ascension (RA)
              </label>
              <input
                id="s1-ra-input"
                type="text"
                value={raInput}
                onChange={(e) => setRaInput(e.target.value)}
                placeholder="e.g. 08h 55m 10.831s"
                className="s1-input"
              />
            </div>
            <div className="s1-field">
              <label htmlFor="s1-dec-input" className="s1-field-k">
                Declination (Dec)
              </label>
              <input
                id="s1-dec-input"
                type="text"
                value={decInput}
                onChange={(e) => setDecInput(e.target.value)}
                placeholder="e.g. -07° 14′ 42.53″"
                className="s1-input"
              />
            </div>
            {coordError && (
              <p className="s1-msg s1-msg--error" role="alert">
                {coordError}
              </p>
            )}
            {coordStatus && !coordError && (
              <p className="s1-msg s1-msg--ok" role="status">
                {coordStatus}
              </p>
            )}
            <button type="submit" className="s1-apply-btn">
              Load Sky Patch
            </button>
          </form>

          <div className="s1-block s1-telemetry-summary">
            <div className="s1-stat-pair">
              <div>
                <span className="s1-stat-k">{readout.primaryMetricLabel}</span>
                <span className="s1-stat-v">{readout.primaryMetricValue}</span>
              </div>
              <div>
                <span className="s1-stat-k">{readout.secondaryMetricLabel}</span>
                <span className="s1-stat-v">{readout.secondaryMetricValue}</span>
              </div>
            </div>
            <p className="s1-summary-copy">
              {activeStar
                ? activeStar.howItChanges
                : `Monitoring multi-epoch SPHEREx passes centered at RA ${customPatch?.ra ?? raInput}, Dec ${customPatch?.dec ?? decInput}.`}
            </p>
          </div>
        </aside>

        {/* CENTER: BIG PICTURE SKY PATCH VIEWER */}
        <div className="s1-center-stage">
          <div className="s1-viewport-frame">
            <canvas
              ref={canvasRef}
              width={840}
              height={525}
              className="s1-viewport-canvas"
              aria-label={
                activeStar
                  ? `${activeStar.name} multi-epoch SPHEREx sky motion viewer`
                  : 'Custom sky coordinates multi-epoch SPHEREx viewer'
              }
            />
            <div className="s1-hud-top">
              <span className="s1-hud-epoch">{readout.epochLabel}</span>
              <span className="s1-hud-coords">
                RA {activeStar ? activeStar.coordinates.ra : raInput} · Dec{' '}
                {activeStar ? activeStar.coordinates.dec : decInput}
              </span>
              <span className="s1-hud-band">{bandLabel}</span>
            </div>
            <div className="s1-hud-bottom">
              <span>{activeStar ? `${activeStar.name} · ${activeStar.spectralType}` : 'Custom Coordinate Field'}</span>
              {blinkCompare && <span className="s1-hud-blink">BLINK COMPARE ACTIVE</span>}
            </div>
          </div>
        </div>

        {/* RIGHT CONTROLS: Video Playback, Spectral Bands & Image Overlays */}
        <aside className="s1-panel s1-panel--right" aria-label="Playback and sky image controls">
          <div className="s1-block">
            <p className="s1-label">Time-Lapse Video</p>
            <div className="s1-play-row">
              <button
                type="button"
                className="s1-primary-ctrl"
                onClick={() => setIsPlaying((p) => !p)}
              >
                {isPlaying ? 'Pause Video' : 'Play Video'}
              </button>
              <button
                type="button"
                className="s1-ctrl-btn"
                onClick={() => {
                  simTimeRef.current = 0;
                  setDisplayTime(0);
                }}
              >
                Reset
              </button>
            </div>

            <div className="s1-step-row">
              <button type="button" className="s1-ctrl-btn" onClick={() => handleStepEpoch(-1)}>
                Prev Epoch
              </button>
              <button type="button" className="s1-ctrl-btn" onClick={() => handleStepEpoch(1)}>
                Next Epoch
              </button>
            </div>

            <label className="s1-range-wrap">
              <span className="s1-range-head">
                <span>Epoch Timeline</span>
                <span>{Math.round((displayTime / loopDuration) * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={loopDuration}
                step={0.05}
                value={Math.min(loopDuration, displayTime)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setIsPlaying(false);
                  simTimeRef.current = val;
                  setDisplayTime(val);
                }}
                className="s1-range"
              />
            </label>

            <div className="s1-speed-row" role="group" aria-label="Playback speed">
              {[1, 5, 25].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  className={`s1-ctrl-btn${speedMultiplier === spd ? ' is-on' : ''}`}
                  onClick={() => setSpeedMultiplier(spd)}
                >
                  {spd}×
                </button>
              ))}
            </div>
          </div>

          <div className="s1-block">
            <p className="s1-label">SPHEREx Spectral Filter</p>
            <div className="s1-filter-col" role="group" aria-label="Spectral band filter">
              <button
                type="button"
                className={`s1-ctrl-btn s1-ctrl-btn--full${spectralBand === 'optical' ? ' is-on' : ''}`}
                onClick={() => setSpectralBand('optical')}
              >
                Optical + IR Composite
              </button>
              <button
                type="button"
                className={`s1-ctrl-btn s1-ctrl-btn--full${spectralBand === 'nir' ? ' is-on' : ''}`}
                onClick={() => setSpectralBand('nir')}
              >
                Near-IR Band (1–2 <span className="s1-unit">µm</span>)
              </button>
              <button
                type="button"
                className={`s1-ctrl-btn s1-ctrl-btn--full${spectralBand === 'mir' ? ' is-on' : ''}`}
                onClick={() => setSpectralBand('mir')}
              >
                Mid-IR Thermal (3–5 <span className="s1-unit">µm</span>)
              </button>
            </div>
          </div>

          <div className="s1-block">
            <p className="s1-label">Overlays &amp; Contrast</p>
            <div className="s1-filter-col">
              <button
                type="button"
                className={`s1-ctrl-btn s1-ctrl-btn--full${blinkCompare ? ' is-on' : ''}`}
                aria-pressed={blinkCompare}
                onClick={() => setBlinkCompare((v) => !v)}
              >
                Blink Compare (Epoch Δ)
              </button>
              <button
                type="button"
                className={`s1-ctrl-btn s1-ctrl-btn--full${showGrid ? ' is-on' : ''}`}
                aria-pressed={showGrid}
                onClick={() => setShowGrid((v) => !v)}
              >
                RA / Dec Coordinate Grid
              </button>
              <button
                type="button"
                className={`s1-ctrl-btn s1-ctrl-btn--full${showTrail ? ' is-on' : ''}`}
                aria-pressed={showTrail}
                onClick={() => setShowTrail((v) => !v)}
              >
                Motion Vector &amp; Trail
              </button>
            </div>

            <label className="s1-range-wrap s1-range-wrap--stretch">
              <span className="s1-range-head">
                <span>Contrast Stretch</span>
                <span>{contrastStretch.toFixed(2)}×</span>
              </span>
              <input
                type="range"
                min={0.8}
                max={2.2}
                step={0.05}
                value={contrastStretch}
                onChange={(e) => setContrastStretch(parseFloat(e.target.value))}
                className="s1-range"
              />
            </label>
          </div>
        </aside>
      </div>
    </div>
  );
}
