import {
  SETTINGS_LIMITS,
  type Difficulty,
  type UserSettings,
} from '../game/config';
import { REFINERY_RECIPES } from '../game/resources';
import { RESOURCES } from '../assets-config';
import type { QualityMode } from '../render/QualityManager';
import { el, formatClock, formatNumber, ICONS, createIcon, setPressed } from './dom';
import type { I18n, StringKey } from './i18n';

export interface PauseCallbacks {
  onResume: () => void;
  onHangar: () => void;
  onQuality: (mode: QualityMode) => void;
  onToggleSound: () => void;
  onToggleHaptics: () => void;
  onDifficulty: (difficulty: Difficulty) => void;
  onSpeedScale: (value: number) => void;
  onSensitivity: (value: number) => void;
  onHudScale: (value: number) => void;
  onHudOpacity: (value: number) => void;
  onToggleAimAssist: () => void;
  onToggleAssistedFlight: () => void;
}

const QUALITY_MODES: readonly { mode: QualityMode; key: StringKey }[] = [
  { mode: 'auto', key: 'common.auto' },
  { mode: 'low', key: 'common.low' },
  { mode: 'medium', key: 'common.medium' },
  { mode: 'high', key: 'common.high' },
];

export class PauseOverlay {
  public readonly root: HTMLDivElement;

  private readonly i18n: I18n;
  private readonly callbacks: PauseCallbacks;
  private readonly titleEl: HTMLHeadingElement;
  private readonly subtitleEl: HTMLParagraphElement;
  private readonly resumeBtn: HTMLButtonElement;
  private readonly hangarBtn: HTMLButtonElement;
  private readonly settingsTitle: HTMLHeadingElement;
  private readonly qualityLabel: HTMLSpanElement;
  private readonly audioLabel: HTMLSpanElement;
  private readonly hapticsLabel: HTMLSpanElement;
  private readonly audioButton: HTMLButtonElement;
  private readonly hapticsButton: HTMLButtonElement;
  private readonly controlsTitle: HTMLHeadingElement;
  private readonly controlsText: HTMLParagraphElement;
  private readonly qualityButtons = new Map<QualityMode, HTMLButtonElement>();
  private readonly qualityModes = new Map<QualityMode, HTMLSpanElement>();
  private readonly difficultyLabel: HTMLSpanElement;
  private readonly difficultyHint: HTMLParagraphElement;
  private readonly difficultyButtons = new Map<Difficulty, HTMLButtonElement>();
  private readonly speedRow: HTMLDivElement;
  private readonly speedLabel: HTMLSpanElement;
  private readonly speedSlider: HTMLInputElement;
  private readonly speedValue: HTMLOutputElement;
  private readonly sensitivityRow: HTMLDivElement;
  private readonly sensitivityLabel: HTMLSpanElement;
  private readonly sensitivitySlider: HTMLInputElement;
  private readonly sensitivityValue: HTMLOutputElement;
  private readonly hudScaleLabel: HTMLSpanElement;
  private readonly hudScaleSlider: HTMLInputElement;
  private readonly hudScaleValue: HTMLOutputElement;
  private readonly hudOpacityLabel: HTMLSpanElement;
  private readonly hudOpacitySlider: HTMLInputElement;
  private readonly hudOpacityValue: HTMLOutputElement;
  private readonly aimAssistLabel: HTMLSpanElement;
  private readonly aimAssistButton: HTMLButtonElement;
  private readonly assistedFlightLabel: HTMLSpanElement;
  private readonly assistedFlightButton: HTMLButtonElement;
  private touchCapable = false;
  private soundEnabled = true;
  private hapticsEnabled = true;
  private qualityMode: QualityMode = 'auto';
  private settings: UserSettings = {
    difficulty: 'easy',
    speedScale: 1,
    sensitivity: 1,
    aimAssist: false,
    assistedFlight: false,
    hudScale: 1,
    hudOpacity: 1,
    showFps: false,
  };

  constructor(root: HTMLElement, i18n: I18n, callbacks: PauseCallbacks) {
    this.i18n = i18n;
    this.callbacks = callbacks;
    this.root = el('div', 'overlay overlay--pause');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');

    const scrim = el('div', 'overlay__scrim');
    const panel = el('div', 'overlay__panel');
    const eyebrow = el('span', 'overlay__eyebrow', 'II');
    this.titleEl = el('h2', 'overlay__title');
    this.subtitleEl = el('p', 'overlay__subtitle');

    const actions = el('div', 'overlay__actions');
    this.resumeBtn = el('button', 'primary-button');
    this.resumeBtn.type = 'button';
    const resumeIcon = createIcon(ICONS.play);
    this.resumeBtn.append(resumeIcon, el('span'));
    this.resumeBtn.addEventListener('click', () => this.callbacks.onResume());
    this.hangarBtn = el('button', 'ghost-button');
    this.hangarBtn.type = 'button';
    this.hangarBtn.addEventListener('click', () => this.callbacks.onHangar());
    actions.append(this.resumeBtn, this.hangarBtn);

    const settings = el('div', 'pause-settings');
    this.settingsTitle = el('h3', 'pause-settings__title');
    const qualityRow = el('div', 'setting-row');
    this.qualityLabel = el('span', 'setting-row__label');
    const qualityGroup = el('div', 'segmented');
    for (const entry of QUALITY_MODES) {
      const button = el('button', 'segmented__button');
      button.type = 'button';
      const label = el('span');
      this.qualityModes.set(entry.mode, label);
      button.append(label);
      button.addEventListener('click', () => this.callbacks.onQuality(entry.mode));
      this.qualityButtons.set(entry.mode, button);
      qualityGroup.appendChild(button);
    }
    qualityRow.append(this.qualityLabel, qualityGroup);

    const difficultyRow = el('div', 'setting-row setting-row--stacked');
    this.difficultyLabel = el('span', 'setting-row__label');
    const difficultyGroup = el('div', 'difficulty-select difficulty-select--compact');
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const button = el('button', 'difficulty-option');
      button.type = 'button';
      button.textContent = this.i18n.t(`difficulty.${level}` as StringKey);
      button.addEventListener('click', () => this.callbacks.onDifficulty(level));
      difficultyGroup.appendChild(button);
      this.difficultyButtons.set(level, button);
    }
    this.difficultyHint = el('p', 'setting-row__hint');
    difficultyRow.append(this.difficultyLabel, difficultyGroup, this.difficultyHint);

    this.speedRow = el('div', 'setting-row');
    this.speedLabel = el('span', 'setting-row__label');
    this.speedSlider = el('input', 'setting-slider');
    this.speedSlider.type = 'range';
    this.speedSlider.min = String(SETTINGS_LIMITS.speed.min);
    this.speedSlider.max = String(SETTINGS_LIMITS.speed.max);
    this.speedSlider.step = String(SETTINGS_LIMITS.speed.step);
    this.speedValue = el('output', 'setting-row__value', '100%');
    this.speedSlider.addEventListener('input', () => {
      this.callbacks.onSpeedScale(Number(this.speedSlider.value));
    });
    this.speedRow.append(this.speedLabel, this.speedSlider, this.speedValue);

    this.sensitivityRow = el('div', 'setting-row');
    this.sensitivityLabel = el('span', 'setting-row__label');
    this.sensitivitySlider = el('input', 'setting-slider');
    this.sensitivitySlider.type = 'range';
    this.sensitivitySlider.min = String(SETTINGS_LIMITS.sensitivity.min);
    this.sensitivitySlider.max = String(SETTINGS_LIMITS.sensitivity.max);
    this.sensitivitySlider.step = String(SETTINGS_LIMITS.sensitivity.step);
    this.sensitivityValue = el('output', 'setting-row__value', '100%');
    this.sensitivitySlider.addEventListener('input', () => {
      this.callbacks.onSensitivity(Number(this.sensitivitySlider.value));
    });
    this.sensitivityRow.append(
      this.sensitivityLabel,
      this.sensitivitySlider,
      this.sensitivityValue,
    );

    const hudScaleRow = el('div', 'setting-row');
    this.hudScaleLabel = el('span', 'setting-row__label');
    this.hudScaleSlider = el('input', 'setting-slider');
    this.hudScaleSlider.type = 'range';
    this.hudScaleSlider.min = String(SETTINGS_LIMITS.hudScale.min);
    this.hudScaleSlider.max = String(SETTINGS_LIMITS.hudScale.max);
    this.hudScaleSlider.step = String(SETTINGS_LIMITS.hudScale.step);
    this.hudScaleValue = el('output', 'setting-row__value', '100%');
    this.hudScaleSlider.addEventListener('input', () => {
      this.callbacks.onHudScale(Number(this.hudScaleSlider.value));
    });
    hudScaleRow.append(this.hudScaleLabel, this.hudScaleSlider, this.hudScaleValue);

    const hudOpacityRow = el('div', 'setting-row');
    this.hudOpacityLabel = el('span', 'setting-row__label');
    this.hudOpacitySlider = el('input', 'setting-slider');
    this.hudOpacitySlider.type = 'range';
    this.hudOpacitySlider.min = String(SETTINGS_LIMITS.hudOpacity.min);
    this.hudOpacitySlider.max = String(SETTINGS_LIMITS.hudOpacity.max);
    this.hudOpacitySlider.step = String(SETTINGS_LIMITS.hudOpacity.step);
    this.hudOpacityValue = el('output', 'setting-row__value', '100%');
    this.hudOpacitySlider.addEventListener('input', () => {
      this.callbacks.onHudOpacity(Number(this.hudOpacitySlider.value));
    });
    hudOpacityRow.append(this.hudOpacityLabel, this.hudOpacitySlider, this.hudOpacityValue);

    const aimRow = el('div', 'setting-row');
    this.aimAssistLabel = el('span', 'setting-row__label');
    this.aimAssistButton = el('button', 'toggle-button');
    this.aimAssistButton.type = 'button';
    this.aimAssistButton.addEventListener('click', () => this.callbacks.onToggleAimAssist());
    aimRow.append(this.aimAssistLabel, this.aimAssistButton);

    const assistedRow = el('div', 'setting-row');
    this.assistedFlightLabel = el('span', 'setting-row__label');
    this.assistedFlightButton = el('button', 'toggle-button');
    this.assistedFlightButton.type = 'button';
    this.assistedFlightButton.addEventListener('click', () =>
      this.callbacks.onToggleAssistedFlight(),
    );
    assistedRow.append(this.assistedFlightLabel, this.assistedFlightButton);

    const audioRow = el('div', 'setting-row');
    this.audioLabel = el('span', 'setting-row__label');
    this.audioButton = el('button', 'toggle-button');
    this.audioButton.type = 'button';
    this.audioButton.addEventListener('click', () => this.callbacks.onToggleSound());
    audioRow.append(this.audioLabel, this.audioButton);

    const hapticsRow = el('div', 'setting-row');
    this.hapticsLabel = el('span', 'setting-row__label');
    this.hapticsButton = el('button', 'toggle-button');
    this.hapticsButton.type = 'button';
    this.hapticsButton.addEventListener('click', () => this.callbacks.onToggleHaptics());
    hapticsRow.append(this.hapticsLabel, this.hapticsButton);

    settings.append(
      this.settingsTitle,
      qualityRow,
      difficultyRow,
      this.speedRow,
      this.sensitivityRow,
      hudScaleRow,
      hudOpacityRow,
      aimRow,
      assistedRow,
      audioRow,
      hapticsRow,
    );

    const controls = el('div', 'pause-controls');
    this.controlsTitle = el('h3', 'pause-controls__title');
    this.controlsText = el('p', 'pause-controls__text');
    controls.append(this.controlsTitle, this.controlsText);

    panel.append(
      eyebrow,
      this.titleEl,
      this.subtitleEl,
      actions,
      settings,
      controls,
    );
    const refinery = el('div', 'pause-settings');
    const refineryTitle = el('h3', 'pause-settings__title');
    refineryTitle.textContent = this.i18n.t('refinery.title');
    const refineryList = el('div', 'refinery-list');
    for (const recipe of REFINERY_RECIPES) {
      const row = el('div', 'refinery-row');
      const inR = RESOURCES[recipe.input];
      const outR = RESOURCES[recipe.output];
      const inTxt = el('span', 'refinery-text');
      inTxt.textContent = `${inR.symbol}${recipe.ratio} -> ${outR.symbol}1`;
      const btn = el('button', 'toggle-button');
      btn.type = 'button';
      btn.textContent = this.i18n.t('refinery.start');
      row.append(inTxt, btn);
      refineryList.appendChild(row);
    }
    refinery.append(refineryTitle, refineryList);
    panel.append(refinery);

    this.root.append(scrim, panel);
    root.appendChild(this.root);
    this.refresh();
  }

  public setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.root.classList.toggle('is-active', visible);
    if (visible) this.resumeBtn.focus({ preventScroll: true });
  }

  public setQualityMode(mode: QualityMode): void {
    this.qualityMode = mode;
    for (const [value, button] of this.qualityButtons) {
      setPressed(button, value === mode);
    }
  }

  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    this.updateToggles();
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
    this.updateToggles();
  }

  public setTouchCapable(touchCapable: boolean): void {
    this.touchCapable = touchCapable;
    this.updateControls();
  }

  public setSettings(settings: UserSettings): void {
    this.settings = { ...settings };
    this.speedSlider.value = String(this.settings.speedScale);
    this.sensitivitySlider.value = String(this.settings.sensitivity);
    this.hudScaleSlider.value = String(this.settings.hudScale);
    this.hudOpacitySlider.value = String(this.settings.hudOpacity);
    this.speedValue.textContent = `${Math.round(this.settings.speedScale * 100)}%`;
    this.sensitivityValue.textContent = `${Math.round(this.settings.sensitivity * 100)}%`;
    this.hudScaleValue.textContent = `${Math.round(this.settings.hudScale * 100)}%`;
    this.hudOpacityValue.textContent = `${Math.round(this.settings.hudOpacity * 100)}%`;
    for (const [level, button] of this.difficultyButtons) {
      const active = level === this.settings.difficulty;
      button.classList.toggle('is-selected', active);
      setPressed(button, active);
    }
    this.difficultyHint.textContent = this.i18n.t(
      `difficulty.${this.settings.difficulty}Hint` as StringKey,
    );
    this.aimAssistButton.textContent = this.i18n.t(
      this.settings.aimAssist ? 'common.on' : 'common.off',
    );
    this.aimAssistButton.classList.toggle('is-off', !this.settings.aimAssist);
    this.assistedFlightButton.textContent = this.i18n.t(
      this.settings.assistedFlight ? 'common.on' : 'common.off',
    );
    this.assistedFlightButton.classList.toggle('is-off', !this.settings.assistedFlight);
  }

  public refresh(): void {
    this.titleEl.textContent = this.i18n.t('pause.title');
    this.subtitleEl.textContent = this.i18n.t('pause.subtitle');
    (this.resumeBtn.querySelector('span') as HTMLElement | null)?.replaceChildren(
      document.createTextNode(this.i18n.t('pause.resume')),
    );
    this.hangarBtn.textContent = this.i18n.t('pause.hangar');
    this.settingsTitle.textContent = this.i18n.t('pause.settings');
    this.qualityLabel.textContent = this.i18n.t('pause.quality');
    this.difficultyLabel.textContent = this.i18n.t('menu.difficulty');
    this.speedLabel.textContent = this.i18n.t('pause.speed');
    this.sensitivityLabel.textContent = this.i18n.t('pause.sensitivity');
    this.hudScaleLabel.textContent = this.i18n.t('pause.hudScale');
    this.hudOpacityLabel.textContent = this.i18n.t('pause.hudOpacity');
    this.aimAssistLabel.textContent = this.i18n.t('pause.aimAssist');
    this.assistedFlightLabel.textContent = this.i18n.t('pause.assistedFlight');
    for (const [level, button] of this.difficultyButtons) {
      button.textContent = this.i18n.t(`difficulty.${level}` as StringKey);
    }
    this.audioLabel.textContent = this.i18n.t('pause.audio');
    this.hapticsLabel.textContent = this.i18n.t('pause.haptics');
    this.controlsTitle.textContent = this.i18n.t('pause.controls');
    for (const entry of QUALITY_MODES) {
      const label = this.qualityModes.get(entry.mode);
      if (label) label.textContent = this.i18n.t(entry.key);
    }
    this.resumeBtn.setAttribute('aria-label', this.i18n.t('pause.resume'));
    this.updateToggles();
    this.updateControls();
    this.setQualityMode(this.qualityMode);
    this.setSettings(this.settings);
  }

  private updateToggles(): void {
    this.audioButton.textContent = this.i18n.t(this.soundEnabled ? 'common.on' : 'common.off');
    this.audioButton.classList.toggle('is-off', !this.soundEnabled);
    this.hapticsButton.textContent = this.i18n.t(
      this.hapticsEnabled ? 'common.on' : 'common.off',
    );
    this.hapticsButton.classList.toggle('is-off', !this.hapticsEnabled);
  }

  private updateControls(): void {
    this.controlsText.textContent = this.i18n.t(
      this.touchCapable ? 'menu.controlsTouch' : 'menu.controlsDesktop',
    );
  }
}

export interface GameOverStats {
  score: number;
  kills: number;
  ore: number;
  time: number;
}

export interface GameOverCallbacks {
  onRelaunch: () => void;
  onHangar: () => void;
}

export class GameOverOverlay {
  public readonly root: HTMLDivElement;

  private readonly i18n: I18n;
  private readonly scoreValue: HTMLElement;
  private readonly killsValue: HTMLElement;
  private readonly oreValue: HTMLElement;
  private readonly timeValue: HTMLElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly subtitleEl: HTMLParagraphElement;
  private readonly relaunchBtn: HTMLButtonElement;
  private readonly hangarBtn: HTMLButtonElement;
  private readonly statLabels = new Map<'score' | 'kills' | 'ore' | 'time', HTMLElement>();
  private stats: GameOverStats = { score: 0, kills: 0, ore: 0, time: 0 };

  constructor(root: HTMLElement, i18n: I18n, callbacks: GameOverCallbacks) {
    this.i18n = i18n;
    this.root = el('div', 'overlay overlay--gameover');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');

    const scrim = el('div', 'overlay__scrim');
    const panel = el('div', 'overlay__panel overlay__panel--gameover');
    const eyebrow = el('span', 'overlay__eyebrow');
    eyebrow.dataset.i18n = 'gameover.eyebrow';
    this.titleEl = el('h2', 'overlay__title overlay__title--danger');
    this.subtitleEl = el('p', 'overlay__subtitle');

    const stats = el('div', 'result-grid');
    this.scoreValue = this.createResult('score', 'gameover.score', stats);
    this.killsValue = this.createResult('kills', 'gameover.kills', stats);
    this.oreValue = this.createResult('ore', 'gameover.ore', stats);
    this.timeValue = this.createResult('time', 'gameover.time', stats);

    const actions = el('div', 'overlay__actions');
    this.relaunchBtn = el('button', 'primary-button');
    this.relaunchBtn.type = 'button';
    this.relaunchBtn.addEventListener('click', () => callbacks.onRelaunch());
    this.hangarBtn = el('button', 'ghost-button');
    this.hangarBtn.type = 'button';
    this.hangarBtn.addEventListener('click', () => callbacks.onHangar());
    actions.append(this.relaunchBtn, this.hangarBtn);

    panel.append(eyebrow, this.titleEl, this.subtitleEl, stats, actions);
    this.root.append(scrim, panel);
    root.appendChild(this.root);
    this.refresh();
  }

  private createResult(
    key: 'score' | 'kills' | 'ore' | 'time',
    labelKey: StringKey,
    host: HTMLElement,
  ): HTMLElement {
    const cell = el('div', 'result-cell');
    const label = el('span', 'result-cell__label');
    label.dataset.i18n = labelKey;
    const value = el('strong', 'result-cell__value', '0');
    this.statLabels.set(key, label);
    cell.append(label, value);
    host.appendChild(cell);
    return value;
  }

  public setStats(stats: GameOverStats): void {
    this.stats = stats;
    this.scoreValue.textContent = formatNumber(stats.score);
    this.killsValue.textContent = formatNumber(stats.kills);
    this.oreValue.textContent = formatNumber(stats.ore, 1);
    this.timeValue.textContent = formatClock(stats.time);
  }

  public setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.root.classList.toggle('is-active', visible);
    if (visible) this.relaunchBtn.focus({ preventScroll: true });
  }

  public refresh(): void {
    this.titleEl.textContent = this.i18n.t('gameover.title');
    const eyebrow = this.root.querySelector<HTMLElement>('[data-i18n="gameover.eyebrow"]');
    if (eyebrow) eyebrow.textContent = this.i18n.t('gameover.eyebrow');
    this.subtitleEl.textContent = this.i18n.t('gameover.subtitle');
    this.relaunchBtn.textContent = this.i18n.t('gameover.relaunch');
    this.hangarBtn.textContent = this.i18n.t('gameover.hangar');
    for (const label of this.statLabels.values()) {
      const key = label.dataset.i18n as StringKey | undefined;
      if (key) label.textContent = this.i18n.t(key);
    }
    this.setStats(this.stats);
  }
}
