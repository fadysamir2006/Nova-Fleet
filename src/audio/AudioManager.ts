import { clamp } from '../game/math';

const STORAGE_KEY = 'nova-fleet-audio';

type Scene = 'hangar' | 'game';

/**
 * Fully procedural Web Audio soundtrack and SFX. No audio files are fetched:
 * lasers, impacts, explosions, engine hum, mining and the ambient drone are
 * synthesized at runtime.
 */
export class AudioManager {
  public enabled = true;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineOscillators: OscillatorNode[] = [];
  private miningGain: GainNode | null = null;
  private miningOscillator: OscillatorNode | null = null;
  private scene: Scene = 'hangar';
  private paused = false;
  private unlockPromise: Promise<void> | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPlayerLaser = -1;
  private lastEnemyLaser = -1;

  constructor() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'on') this.enabled = true;
      if (saved === 'off') this.enabled = false;
    } catch {
      // Storage can be unavailable in private browsing contexts.
    }
  }

  public async unlock(): Promise<void> {
    if (!this.enabled) return;
    if (this.unlockPromise) return this.unlockPromise;
    this.unlockPromise = this.startContext();
    await this.unlockPromise;
    this.unlockPromise = null;
  }

  private async startContext(): Promise<void> {
    if (!this.context) {
      const AudioContextCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      this.context = new AudioContextCtor();
      this.buildGraph(this.context);
    }
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        return;
      }
    }
    this.applyMix();
  }

  private buildGraph(context: AudioContext): void {
    this.master = context.createGain();
    this.master.gain.value = this.enabled ? 0.82 : 0;
    this.master.connect(context.destination);

    this.sfx = context.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);

    this.ambientGain = context.createGain();
    this.ambientGain.gain.value = 0;
    this.ambientGain.connect(this.master);

    const ambientFilter = context.createBiquadFilter();
    ambientFilter.type = 'lowpass';
    ambientFilter.frequency.value = 310;
    ambientFilter.Q.value = 0.8;
    ambientFilter.connect(this.ambientGain);

    for (const [frequency, type, gainValue] of [
      [41.2, 'sine', 0.55],
      [55, 'triangle', 0.16],
      [82.4, 'sine', 0.1],
    ] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.value = gainValue;
      oscillator.connect(gain);
      gain.connect(ambientFilter);
      oscillator.start();
    }

    const slowLfo = context.createOscillator();
    slowLfo.frequency.value = 0.07;
    const slowDepth = context.createGain();
    slowDepth.gain.value = 110;
    slowLfo.connect(slowDepth);
    slowDepth.connect(ambientFilter.frequency);
    slowLfo.start();

    this.engineFilter = context.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 380;
    this.engineFilter.Q.value = 2.2;
    this.engineGain = context.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    for (const [frequency, type, gainValue] of [
      [48, 'sawtooth', 0.38],
      [72, 'triangle', 0.2],
    ] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.value = gainValue;
      oscillator.connect(gain);
      gain.connect(this.engineFilter);
      oscillator.start();
      this.engineOscillators.push(oscillator);
    }

    const miningFilter = context.createBiquadFilter();
    miningFilter.type = 'bandpass';
    miningFilter.frequency.value = 760;
    miningFilter.Q.value = 3.4;
    this.miningGain = context.createGain();
    this.miningGain.gain.value = 0;
    miningFilter.connect(this.miningGain);
    this.miningGain.connect(this.master);
    this.miningOscillator = context.createOscillator();
    this.miningOscillator.type = 'sawtooth';
    this.miningOscillator.frequency.value = 176;
    const miningLfo = context.createOscillator();
    miningLfo.frequency.value = 6.5;
    const miningDepth = context.createGain();
    miningDepth.gain.value = 32;
    miningLfo.connect(miningDepth);
    miningDepth.connect(this.miningOscillator.frequency);
    miningLfo.start();
    this.miningOscillator.connect(miningFilter);
    this.miningOscillator.start();

    const noiseLength = Math.floor(context.sampleRate * 1.2);
    this.noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // Ignore storage errors.
    }
    if (enabled) {
      void this.unlock();
    } else if (this.context && this.master) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.03);
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public setScene(scene: Scene): void {
    this.scene = scene;
    this.paused = false;
    this.applyMix();
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyMix();
  }

  private applyMix(): void {
    if (!this.context || !this.ambientGain || !this.engineGain || !this.miningGain) return;
    const now = this.context.currentTime;
    const ambient = this.paused ? 0.42 : this.scene === 'hangar' ? 0.5 : 0.2;
    this.ambientGain.gain.setTargetAtTime(ambient, now, 0.3);
    if (this.paused || this.scene === 'hangar') {
      this.engineGain.gain.setTargetAtTime(0, now, 0.12);
      this.miningGain.gain.setTargetAtTime(0, now, 0.06);
    }
    if (this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.82 : 0, now, 0.06);
    }
  }

  public updateEngine(speedRatio: number, boost: boolean, active: boolean): void {
    if (!this.context || !this.engineGain || !this.engineFilter || this.paused) return;
    const now = this.context.currentTime;
    const ratio = clamp(speedRatio, 0, 2.4);
    const target = active && this.scene === 'game' ? 0.02 + ratio * 0.032 + (boost ? 0.026 : 0) : 0;
    this.engineGain.gain.setTargetAtTime(target, now, 0.12);
    this.engineFilter.frequency.setTargetAtTime(340 + ratio * 260 + (boost ? 220 : 0), now, 0.18);
    for (const [index, oscillator] of this.engineOscillators.entries()) {
      const base = index === 0 ? 48 : 72;
      oscillator.frequency.setTargetAtTime(base + ratio * (index === 0 ? 38 : 55), now, 0.2);
    }
  }

  public setMining(active: boolean): void {
    if (!this.context || !this.miningGain) return;
    const target = active && this.scene === 'game' && !this.paused ? 0.026 : 0;
    this.miningGain.gain.setTargetAtTime(target, this.context.currentTime, 0.05);
    if (this.miningOscillator) {
      this.miningOscillator.frequency.setTargetAtTime(
        active ? 190 : 156,
        this.context.currentTime,
        0.08,
      );
    }
  }

  public playLaser(team: 'player' | 'enemy'): void {
    const context = this.context;
    if (!context || !this.sfx || !this.enabled) return;
    const now = context.currentTime;
    if (team === 'player') {
      if (now - this.lastPlayerLaser < 0.055) return;
      this.lastPlayerLaser = now;
    } else {
      if (now - this.lastEnemyLaser < 0.11) return;
      this.lastEnemyLaser = now;
    }

    const oscillator = context.createOscillator();
    oscillator.type = team === 'player' ? 'sawtooth' : 'square';
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(team === 'player' ? 1450 : 720, now);
    oscillator.frequency.exponentialRampToValueAtTime(team === 'player' ? 260 : 180, now + 0.14);
    gain.gain.setValueAtTime(team === 'player' ? 0.055 : 0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
    oscillator.connect(gain);
    gain.connect(this.sfx);
    oscillator.start(now);
    oscillator.stop(now + 0.19);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  public playImpact(shield: boolean): void {
    if (!this.context || !this.sfx) return;
    this.noiseBurst(shield ? 0.09 : 0.13, shield ? 'highpass' : 'lowpass', shield ? 1700 : 620, 0.09);
    const context = this.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(shield ? 410 : 150, now);
    oscillator.frequency.exponentialRampToValueAtTime(70, now + 0.16);
    gain.gain.setValueAtTime(shield ? 0.05 : 0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    oscillator.connect(gain);
    gain.connect(this.sfx);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  public playExplosion(scale = 1): void {
    if (!this.context || !this.sfx) return;
    const duration = 0.45 + Math.min(scale, 2) * 0.35;
    this.noiseBurst(duration, 'lowpass', 420, 0.24 * Math.min(1.5, scale));
    const context = this.context;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(88, now);
    oscillator.frequency.exponentialRampToValueAtTime(28, now + duration);
    gain.gain.setValueAtTime(0.16 * Math.min(scale, 1.4), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.sfx);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.05);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  public playAsteroidBreak(): void {
    if (!this.context || !this.sfx) return;
    this.noiseBurst(0.34, 'bandpass', 330, 0.16, 1.6);
  }

  public playLock(acquired: boolean): void {
    if (!this.context || !this.sfx) return;
    const context = this.context;
    const now = context.currentTime;
    for (const [index, frequency] of (acquired ? [880, 1320] : [520, 360]).entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const start = now + index * 0.075;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.045, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.08);
      oscillator.connect(gain);
      gain.connect(this.sfx);
      oscillator.start(start);
      oscillator.stop(start + 0.1);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
  }

  public playWarning(): void {
    if (!this.context || !this.sfx) return;
    const context = this.context;
    const now = context.currentTime;
    for (let i = 0; i < 3; i += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = i % 2 === 0 ? 440 : 620;
      const start = now + i * 0.11;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.04, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);
      oscillator.connect(gain);
      gain.connect(this.sfx);
      oscillator.start(start);
      oscillator.stop(start + 0.09);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
  }

  /** Short reversed-whoosh cue for an enemy materializing from warp. */
  public playWarpIn(): void {
    if (!this.context || !this.sfx) return;
    const context = this.context;
    const now = context.currentTime;
    this.noiseBurst(0.5, 'bandpass', 540, 0.09, 1.9);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(180, now);
    oscillator.frequency.exponentialRampToValueAtTime(760, now + 0.36);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
    oscillator.connect(gain);
    gain.connect(this.sfx);
    oscillator.start(now);
    oscillator.stop(now + 0.5);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  /** Directional-hit warning: a low thud plus a two-tone alarm. */
  public playDamageAlarm(): void {
    if (!this.context || !this.sfx) return;
    const context = this.context;
    const now = context.currentTime;
    this.noiseBurst(0.22, 'lowpass', 260, 0.13);
    for (let i = 0; i < 2; i += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(i === 0 ? 260 : 205, now + i * 0.09);
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.03, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
      oscillator.connect(gain);
      gain.connect(this.sfx);
      oscillator.start(start);
      oscillator.stop(start + 0.085);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
  }

  public playOre(): void {
    if (!this.context || !this.sfx) return;
    const context = this.context;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1050, now);
    oscillator.frequency.exponentialRampToValueAtTime(1480, now + 0.07);
    gain.gain.setValueAtTime(0.028, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    oscillator.connect(gain);
    gain.connect(this.sfx);
    oscillator.start(now);
    oscillator.stop(now + 0.12);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  public playUi(): void {
    if (!this.context || !this.sfx) return;
    const context = this.context;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    oscillator.connect(gain);
    gain.connect(this.sfx);
    oscillator.start(now);
    oscillator.stop(now + 0.07);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  private noiseBurst(
    duration: number,
    filterType: BiquadFilterType,
    frequency: number,
    volume: number,
    q = 0.8,
  ): void {
    const context = this.context;
    if (!context || !this.sfx || !this.noiseBuffer) return;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    source.start(now);
    source.stop(now + duration + 0.02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  public dispose(): void {
    this.enabled = false;
    if (this.context) {
      const context = this.context;
      this.context = null;
      void context.close().catch(() => undefined);
    }
  }
}
