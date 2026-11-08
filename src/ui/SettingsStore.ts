import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  SETTINGS_LIMITS,
  getDefaultSettings,
  type Difficulty,
  type UserSettings,
} from '../game/config';

const STORAGE_KEY = 'nova-fleet-settings';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const roundStep = (value: number, step: number): number =>
  Math.round(value / step) * step;

/**
 * Persisted player preferences. Gameplay tuning itself stays in
 * `src/game/config.ts`; this store only records the player's chosen values.
 */
export class SettingsStore {
  public settings: UserSettings;

  constructor(mobile: boolean) {
    this.settings = this.load(mobile);
  }

  private load(mobile: boolean): UserSettings {
    const defaults = getDefaultSettings(mobile);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      return {
        difficulty: this.readDifficulty(parsed.difficulty),
        speedScale: this.readRange(
          parsed.speedScale,
          SETTINGS_LIMITS.speed.min,
          SETTINGS_LIMITS.speed.max,
          SETTINGS_LIMITS.speed.step,
          defaults.speedScale,
        ),
        sensitivity: this.readRange(
          parsed.sensitivity,
          SETTINGS_LIMITS.sensitivity.min,
          SETTINGS_LIMITS.sensitivity.max,
          SETTINGS_LIMITS.sensitivity.step,
          defaults.sensitivity,
        ),
        aimAssist:
          typeof parsed.aimAssist === 'boolean' ? parsed.aimAssist : defaults.aimAssist,
        assistedFlight:
          typeof parsed.assistedFlight === 'boolean'
            ? parsed.assistedFlight
            : defaults.assistedFlight,
        hudScale: this.readRange(
          parsed.hudScale,
          SETTINGS_LIMITS.hudScale.min,
          SETTINGS_LIMITS.hudScale.max,
          SETTINGS_LIMITS.hudScale.step,
          defaults.hudScale,
        ),
        hudOpacity: this.readRange(
          parsed.hudOpacity,
          SETTINGS_LIMITS.hudOpacity.min,
          SETTINGS_LIMITS.hudOpacity.max,
          SETTINGS_LIMITS.hudOpacity.step,
          defaults.hudOpacity,
        ),
        showFps: typeof parsed.showFps === 'boolean' ? parsed.showFps : defaults.showFps,
      };
    } catch {
      return defaults;
    }
  }

  private readDifficulty(value: unknown): Difficulty {
    return value === 'easy' || value === 'normal' || value === 'hard'
      ? value
      : DEFAULT_DIFFICULTY;
  }

  private readRange(
    value: unknown,
    min: number,
    max: number,
    step: number,
    fallback: number,
  ): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? roundStep(clamp(value, min, max), step)
      : fallback;
  }

  public update(patch: Partial<UserSettings>): UserSettings {
    const next: UserSettings = {
      ...this.settings,
      ...patch,
    };
    next.difficulty = DIFFICULTIES[next.difficulty] ? next.difficulty : DEFAULT_DIFFICULTY;
    next.speedScale = roundStep(
      clamp(next.speedScale, SETTINGS_LIMITS.speed.min, SETTINGS_LIMITS.speed.max),
      SETTINGS_LIMITS.speed.step,
    );
    next.sensitivity = roundStep(
      clamp(
        next.sensitivity,
        SETTINGS_LIMITS.sensitivity.min,
        SETTINGS_LIMITS.sensitivity.max,
      ),
      SETTINGS_LIMITS.sensitivity.step,
    );
    next.hudScale = roundStep(
      clamp(next.hudScale, SETTINGS_LIMITS.hudScale.min, SETTINGS_LIMITS.hudScale.max),
      SETTINGS_LIMITS.hudScale.step,
    );
    next.hudOpacity = roundStep(
      clamp(next.hudOpacity, SETTINGS_LIMITS.hudOpacity.min, SETTINGS_LIMITS.hudOpacity.max),
      SETTINGS_LIMITS.hudOpacity.step,
    );
    this.settings = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private/embedded contexts may reject storage; in-memory settings still work.
    }
    return next;
  }
}
