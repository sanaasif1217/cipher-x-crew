/**
 * Procedural deep-space ambient audio engine for Watch the Sky Change.
 * Synthesizes a warm D-Dorian harmonic pad, a secondary deeper sub-bass space hum,
 * cosmic solar-wind texture, milestone-driven synthetic resonance, and gentle crystalline chimes
 * routed through a BiquadFilterNode low-pass filter so hovering the CTA muffles smoothly.
 *
 * Starts muted and fades in/out cleanly on toggleMute().
 */

export interface AudioStoreApi {
  isInitialized: boolean;
  isMuted: boolean;
  initAudio: () => void;
  toggleMute: () => boolean;
  setMuffled: (muffled: boolean) => void;
  updateMilestoneAudio: (proximity: number, landmarkIndex: number, speedScalar: number) => void;
  playLandmarkChime: (landmarkIndex: number) => void;
  dispose: () => void;
}

const MILESTONE_RESONANCE_CHORDS: ReadonlyArray<readonly [number, number]> = [
  [146.83, 220.0], // Nebula: D3 + A3
  [174.61, 261.63], // Ringed Exoplanet: F3 + C4
  [220.0, 329.63], // Spiral Galaxy: A3 + E4
  [196.0, 293.66], // Crew Observatory Beacon: G3 + D4
];

class CosmosAudioEngine implements AudioStoreApi {
  public isInitialized = false;
  public isMuted = true;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private deepHumGainNode: GainNode | null = null;
  private deepHumFilter: BiquadFilterNode | null = null;
  private resonanceOscA: OscillatorNode | null = null;
  private resonanceOscB: OscillatorNode | null = null;
  private resonanceFilter: BiquadFilterNode | null = null;
  private resonanceGainNode: GainNode | null = null;
  private lastModTime = -1;
  private chimeTimer: number | null = null;
  private nodesStarted = false;
  private stopFns: Array<() => void> = [];

  public initAudio(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    // Defer actual AudioContext node creation until first unmute if autoplay is locked,
    // or initialize cleanly right away if allowed.
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = 'lowpass';
      this.lowpass.frequency.value = 4600;
      this.lowpass.Q.value = 0.7;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;

      this.lowpass.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    } catch {
      // Ignore if AudioContext cannot be constructed in restricted environments
    }
  }

  private ensureSynthGraph(): void {
    if (!this.ctx || !this.lowpass || this.nodesStarted) return;
    this.nodesStarted = true;
    const ctx = this.ctx;

    // Warm D-Dorian drone oscillators (D2, A2, F3, C4)
    const freqs = [73.42, 110.0, 174.61, 261.63];
    const gains = [0.22, 0.16, 0.08, 0.045];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;

      const subGain = ctx.createGain();
      subGain.gain.value = gains[idx];

      // Slow organic breathing LFO per voice
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07 + idx * 0.025;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = gains[idx] * 0.35;
      lfo.connect(lfoDepth);
      lfoDepth.connect(subGain.gain);

      osc.connect(subGain);
      subGain.connect(this.lowpass!);
      osc.start();
      lfo.start();

      this.stopFns.push(() => {
        try {
          osc.stop();
          lfo.stop();
        } catch {
          // already stopped
        }
      });
    });

    // Secondary deeper sub-bass space hum (binaural D1 36.71 Hz / 36.88 Hz + A1 55.00 Hz)
    this.deepHumFilter = ctx.createBiquadFilter();
    this.deepHumFilter.type = 'lowpass';
    this.deepHumFilter.frequency.value = 135;
    this.deepHumFilter.Q.value = 1.6;

    this.deepHumGainNode = ctx.createGain();
    this.deepHumGainNode.gain.value = 0.16;

    const humLfo = ctx.createOscillator();
    humLfo.type = 'sine';
    humLfo.frequency.value = 0.045;
    const humLfoDepth = ctx.createGain();
    humLfoDepth.gain.value = 18;
    humLfo.connect(humLfoDepth);
    humLfoDepth.connect(this.deepHumFilter.frequency);
    humLfo.start();

    this.stopFns.push(() => {
      try {
        humLfo.stop();
      } catch {
        // already stopped
      }
    });

    const humVoices: Array<{ freq: number; type: OscillatorType; gain: number }> = [
      { freq: 36.71, type: 'sine', gain: 0.68 },
      { freq: 36.88, type: 'sine', gain: 0.56 },
      { freq: 55.0, type: 'triangle', gain: 0.32 },
    ];

    humVoices.forEach((voice) => {
      const osc = ctx.createOscillator();
      osc.type = voice.type;
      osc.frequency.value = voice.freq;

      const vGain = ctx.createGain();
      vGain.gain.value = voice.gain;

      osc.connect(vGain);
      vGain.connect(this.deepHumFilter!);
      osc.start();

      this.stopFns.push(() => {
        try {
          osc.stop();
        } catch {
          // already stopped
        }
      });
    });

    this.deepHumFilter.connect(this.deepHumGainNode);
    this.deepHumGainNode.connect(this.lowpass);

    // Subtle synthetic resonance layer that swells as the viewer approaches major milestones
    this.resonanceOscA = ctx.createOscillator();
    this.resonanceOscA.type = 'triangle';
    this.resonanceOscA.frequency.value = MILESTONE_RESONANCE_CHORDS[0][0];

    this.resonanceOscB = ctx.createOscillator();
    this.resonanceOscB.type = 'sawtooth';
    this.resonanceOscB.frequency.value = MILESTONE_RESONANCE_CHORDS[0][1] + 0.6;

    const resMixA = ctx.createGain();
    resMixA.gain.value = 0.65;
    const resMixB = ctx.createGain();
    resMixB.gain.value = 0.35;

    this.resonanceFilter = ctx.createBiquadFilter();
    this.resonanceFilter.type = 'lowpass';
    this.resonanceFilter.frequency.value = 190;
    this.resonanceFilter.Q.value = 4.2;

    this.resonanceGainNode = ctx.createGain();
    this.resonanceGainNode.gain.value = 0;

    this.resonanceOscA.connect(resMixA);
    this.resonanceOscB.connect(resMixB);
    resMixA.connect(this.resonanceFilter);
    resMixB.connect(this.resonanceFilter);
    this.resonanceFilter.connect(this.resonanceGainNode);
    this.resonanceGainNode.connect(this.lowpass);

    this.resonanceOscA.start();
    this.resonanceOscB.start();

    this.stopFns.push(() => {
      try {
        this.resonanceOscA?.stop();
        this.resonanceOscB?.stop();
      } catch {
        // already stopped
      }
    });

    // Soft filtered pink-ish breeze noise
    const bufferSize = ctx.sampleRate * 3;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.05;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    noiseSrc.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 1.4;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.14;

    noiseSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.lowpass);
    noiseSrc.start();

    this.stopFns.push(() => {
      try {
        noiseSrc.stop();
      } catch {
        // already stopped
      }
    });

    // Occasional soft dewdrop harmonic chime
    const pentatonic = [293.66, 349.23, 440.0, 523.25, 659.25];
    const scheduleChime = () => {
      this.chimeTimer = window.setTimeout(() => {
        if (!this.isMuted && this.ctx && this.lowpass && this.ctx.state === 'running') {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = pentatonic[Math.floor(Math.random() * pentatonic.length)];
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.045, now + 0.12);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
          osc.connect(gain);
          gain.connect(this.lowpass);
          osc.start(now);
          osc.stop(now + 3.5);
        }
        scheduleChime();
      }, 2800 + Math.random() * 4200);
    };
    scheduleChime();
  }

  public toggleMute(): boolean {
    if (!this.isInitialized) {
      this.initAudio();
    }
    this.isMuted = !this.isMuted;

    if (this.ctx && this.masterGain) {
      if (!this.isMuted) {
        if (this.ctx.state === 'suspended') {
          void this.ctx.resume();
        }
        this.ensureSynthGraph();
      }
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(this.isMuted ? 0 : 0.28, now + 0.65);
    }

    return this.isMuted;
  }

  public setMuffled(muffled: boolean): void {
    if (!this.ctx || !this.lowpass) return;
    const now = this.ctx.currentTime;
    this.lowpass.frequency.cancelScheduledValues(now);
    this.lowpass.frequency.setValueAtTime(this.lowpass.frequency.value, now);
    this.lowpass.frequency.exponentialRampToValueAtTime(muffled ? 360 : 4600, now + 0.6);
  }

  public updateMilestoneAudio(proximity: number, landmarkIndex: number, speedScalar: number): void {
    if (this.isMuted || !this.ctx || !this.nodesStarted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.lastModTime >= 0 && now - this.lastModTime < 0.08) return;
    this.lastModTime = now;

    const prox = Math.max(0, Math.min(1, proximity));
    const speed = Math.max(0, Math.min(1, speedScalar));
    const chord = MILESTONE_RESONANCE_CHORDS[Math.abs(landmarkIndex) % MILESTONE_RESONANCE_CHORDS.length];

    if (this.deepHumGainNode && this.deepHumFilter) {
      this.deepHumGainNode.gain.setTargetAtTime(0.16 + speed * 0.09 + prox * 0.07, now, 0.28);
      this.deepHumFilter.frequency.setTargetAtTime(125 + speed * 65 + prox * 45, now, 0.28);
    }

    if (this.resonanceOscA && this.resonanceOscB && this.resonanceFilter && this.resonanceGainNode) {
      this.resonanceOscA.frequency.setTargetAtTime(chord[0], now, 0.35);
      this.resonanceOscB.frequency.setTargetAtTime(chord[1] + 0.6, now, 0.35);
      this.resonanceFilter.frequency.setTargetAtTime(190 + prox * 420 + speed * 90, now, 0.28);
      this.resonanceGainNode.gain.setTargetAtTime(prox * (0.14 + speed * 0.03), now, 0.28);
    }
  }

  public playLandmarkChime(landmarkIndex: number): void {
    if (this.isMuted || !this.ctx || !this.lowpass || this.ctx.state !== 'running') return;
    const chords = [
      [293.66, 440.0], // Nebula: D4 + A4
      [349.23, 523.25], // Ringed Planet: F4 + C5
      [440.0, 659.25], // Spiral Galaxy: A4 + E5
      [392.0, 587.33], // Crew Observatory Beacon: G4 + D5
    ];
    const pair = chords[Math.abs(landmarkIndex) % chords.length];
    const now = this.ctx.currentTime;

    pair.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 3.6);
      osc.connect(gain);
      gain.connect(this.lowpass!);
      osc.start(start);
      osc.stop(start + 3.7);
    });

    // Subtle resonant sub-octave synth swell to anchor the destination milestone
    const resOsc = this.ctx.createOscillator();
    const resFilter = this.ctx.createBiquadFilter();
    const resGain = this.ctx.createGain();
    resOsc.type = 'triangle';
    resOsc.frequency.value = pair[0] * 0.5;
    resFilter.type = 'lowpass';
    resFilter.Q.value = 3.8;
    resFilter.frequency.setValueAtTime(180, now);
    resFilter.frequency.exponentialRampToValueAtTime(680, now + 0.85);
    resFilter.frequency.exponentialRampToValueAtTime(220, now + 3.6);
    resGain.gain.setValueAtTime(0.0001, now);
    resGain.gain.exponentialRampToValueAtTime(0.048, now + 0.6);
    resGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);

    resOsc.connect(resFilter);
    resFilter.connect(resGain);
    resGain.connect(this.lowpass);
    resOsc.start(now);
    resOsc.stop(now + 3.7);
  }

  public dispose(): void {
    if (this.chimeTimer !== null) {
      window.clearTimeout(this.chimeTimer);
      this.chimeTimer = null;
    }
    for (const stop of this.stopFns) stop();
    this.stopFns = [];
    this.deepHumGainNode = null;
    this.deepHumFilter = null;
    this.resonanceOscA = null;
    this.resonanceOscB = null;
    this.resonanceFilter = null;
    this.resonanceGainNode = null;
    this.lastModTime = -1;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.isInitialized = false;
    this.nodesStarted = false;
  }
}

export function createAudioStore(): () => AudioStoreApi {
  const instance = new CosmosAudioEngine();
  return () => instance;
}
