const STORAGE_KEY = 'nova-fleet-haptics';

/**
 * Small wrapper around the Vibration API. Browsers that do not support it
 * simply ignore the calls; iOS Safari in particular does not expose it.
 */
export class Haptics {
  public enabled = true;
  private readonly supported =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  constructor() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'on') this.enabled = true;
      if (saved === 'off') this.enabled = false;
    } catch {
      // Storage can be unavailable in private browsing contexts.
    }
  }

  public get isSupported(): boolean {
    return this.supported;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.cancel();
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // Ignore storage errors.
    }
  }

  public pulse(pattern: number | number[]): void {
    if (!this.enabled || !this.supported) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some embedded browsers throw even when the API exists.
    }
  }

  public cancel(): void {
    if (!this.supported) return;
    try {
      navigator.vibrate(0);
    } catch {
      // Ignore.
    }
  }
}
