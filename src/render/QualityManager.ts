export type QualityLevel = 'low' | 'medium' | 'high';
export type QualityMode = 'auto' | QualityLevel;

export interface QualitySettings {
  level: QualityLevel;
  maxPixelRatio: number;
  bloom: boolean;
  bloomStrength: number;
  particleBudget: number;
  asteroidDetailDistance: number;
  dustCount: number;
  msaaSamples: number;
  shadowMapSize: number;
}

export const QUALITY_SETTINGS: Record<QualityLevel, QualitySettings> = {
  low: {
    level: 'low',
    maxPixelRatio: 1,
    bloom: false,
    bloomStrength: 0,
    particleBudget: 260,
    asteroidDetailDistance: 380,
    dustCount: 110,
    msaaSamples: 0,
    shadowMapSize: 0,
  },
  medium: {
    level: 'medium',
    maxPixelRatio: 1.4,
    bloom: true,
    bloomStrength: 0.32,
    particleBudget: 620,
    asteroidDetailDistance: 720,
    dustCount: 210,
    msaaSamples: 2,
    shadowMapSize: 0,
  },
  high: {
    level: 'high',
    maxPixelRatio: 1.9,
    bloom: true,
    bloomStrength: 0.42,
    particleBudget: 980,
    asteroidDetailDistance: 1050,
    dustCount: 320,
    msaaSamples: 4,
    shadowMapSize: 0,
  },
};

const ORDER: readonly QualityLevel[] = ['low', 'medium', 'high'];

const isMobile = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const pickInitialLevel = (): QualityLevel => {
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (cores <= 4 || memory <= 2) return 'low';
  return isMobile() ? 'medium' : 'high';
};

/**
 * Watches measured frame rate and adjusts render quality with hysteresis.
 * Manual quality modes are supported for the pause menu.
 */
export class QualityManager {
  public mode: QualityMode = 'auto';
  public level: QualityLevel;
  public averageFps = 60;

  private settings: QualitySettings;
  private listeners = new Set<(settings: QualitySettings, automatic: boolean) => void>();
  private frames = 0;
  private sampleTime = 0;
  private warmup = 4.5;
  private timeSinceChange = 0;
  private badWindows = 0;
  private goodWindows = 0;

  constructor() {
    this.level = pickInitialLevel();
    this.settings = QUALITY_SETTINGS[this.level];
  }

  public get current(): QualitySettings {
    return this.settings;
  }

  public onChange(listener: (settings: QualitySettings, automatic: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public setMode(mode: QualityMode): void {
    this.mode = mode;
    if (mode !== 'auto' && mode !== this.level) {
      this.applyLevel(mode, false);
    }
  }

  public sample(dt: number): void {
    if (dt <= 0 || dt > 0.12) return;
    this.frames += 1;
    this.sampleTime += dt;
    this.timeSinceChange += dt;
    if (this.sampleTime < 2.4) return;

    const fps = this.frames / this.sampleTime;
    this.averageFps = this.averageFps * 0.55 + fps * 0.45;
    this.frames = 0;
    this.sampleTime = 0;

    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    if (this.mode !== 'auto' || this.timeSinceChange < 7) return;

    if (fps < 44) {
      this.badWindows += 1;
      this.goodWindows = 0;
    } else if (fps > 57) {
      this.goodWindows += 1;
      this.badWindows = 0;
    } else {
      this.badWindows = 0;
      this.goodWindows = 0;
    }

    const index = ORDER.indexOf(this.level);
    if (this.badWindows >= 2 && index > 0) {
      this.applyLevel(ORDER[index - 1], true);
      this.badWindows = 0;
    } else if (this.goodWindows >= 3 && index < ORDER.length - 1) {
      this.applyLevel(ORDER[index + 1], true);
      this.goodWindows = 0;
    }
  }

  private applyLevel(level: QualityLevel, automatic: boolean): void {
    this.level = level;
    this.settings = QUALITY_SETTINGS[level];
    this.timeSinceChange = 0;
    this.warmup = Math.max(this.warmup, 2.5);
    for (const listener of this.listeners) listener(this.settings, automatic);
  }
}

export const qualityLabelKeys: Record<QualityLevel, 'common.low' | 'common.medium' | 'common.high'> = {
  low: 'common.low',
  medium: 'common.medium',
  high: 'common.high',
};
