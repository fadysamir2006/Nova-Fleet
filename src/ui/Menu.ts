import type { ShipDefinition } from '../assets-config';
import { DEFAULT_DIFFICULTY, type Difficulty } from '../game/config';
import { clamp } from '../game/math';
import { clear, createIcon, el, ICONS, setPressed } from './dom';
import type { I18n, StringKey } from './i18n';
import { ProfileStore } from './ProfileStore';
import { SOLAR_SYSTEM } from '../game/solarSystem';
import { ZONES } from '../game/worldData';

import type { PlayerLoadout } from '../game/types';

export interface MenuCallbacks {
  onSelectShip: (id: string) => void;
  onSelectDifficulty: (difficulty: Difficulty) => void;
  onLaunch: () => void;
  onToggleLanguage: () => void;
  onToggleSound: () => void;
  onToggleHaptics: () => void;
  onToggleFps: () => void;
  onProfileChange: (name: string | null) => void;
  onOpenMap: () => void;
  onOpenMarket: () => void;
  onOpenColony: () => void;
  onOpenCodex: () => void;
  onFitApplied?: (shipId: string, loadout: PlayerLoadout) => void;
  onSellModule?: (moduleId: string, qty: number) => void;
}

type MenuSection = 'play' | 'hangar' | 'settings' | 'fitting';
type RailAction = MenuSection | 'colony' | 'map' | 'market' | 'codex' | 'credits';
type Mode = 'solo' | 'multi';

interface RailEntry {
  id: RailAction;
  icon: string;
  key: StringKey;
}

const RAIL: readonly RailEntry[] = [
  { id: 'play', icon: ICONS.play, key: 'menu.nav.play' },
  { id: 'hangar', icon: ICONS.ship, key: 'menu.nav.hangar' },
  { id: 'fitting', icon: ICONS.wrench, key: 'menu.nav.fitting' },
  { id: 'colony', icon: ICONS.colony, key: 'menu.nav.colony' },
  { id: 'map', icon: ICONS.map, key: 'menu.nav.map' },
  { id: 'market', icon: ICONS.market, key: 'menu.nav.market' },
  { id: 'codex', icon: ICONS.codex, key: 'menu.codex' },
  { id: 'settings', icon: ICONS.gear, key: 'menu.nav.settings' },
  { id: 'credits', icon: ICONS.credits, key: 'menu.nav.credits' },
];

const METRIC_KEYS: readonly StringKey[] = [
  'menu.stat.damage',
  'menu.stat.tank',
  'menu.stat.mobility',
  'menu.stat.capacitor',
  'menu.stat.cargo',
  'menu.stat.mining',
];

const ROLE_KEYS: Record<ShipDefinition['hullClass'], StringKey> = {
  combat: 'menu.role.combat',
  logistics: 'menu.role.support',
  prospector: 'menu.role.mining',
};

const metricsFor = (ship: ShipDefinition): number[] => [
  ship.stats.weapon,
  ship.stats.armor,
  ship.stats.speed,
  clamp(Math.round(ship.loadout.maxShield / 1.7), 8, 100),
  clamp(Math.round(ship.loadout.cargoCapacity / 1.25), 8, 100),
  ship.stats.mining,
];

export class Menu {
  public readonly root: HTMLDivElement;

  private readonly i18n: I18n;
  private readonly callbacks: MenuCallbacks;
  private readonly languageButton: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly hapticsButton: HTMLButtonElement;
  private readonly railButtons = new Map<RailAction, HTMLButtonElement>();
  private readonly sectionEls = new Map<MenuSection, HTMLElement>();
  private readonly modeButtons = new Map<Mode, HTMLButtonElement>();
  private readonly carouselHost: HTMLDivElement;
  private readonly detailName: HTMLSpanElement;
  private readonly detailRole: HTMLSpanElement;
  private readonly detailLore: HTMLParagraphElement;
  private readonly detailBars: HTMLDivElement;
  private readonly detailSlots: HTMLDivElement;
  private readonly fittingSlots: HTMLDivElement;
  private readonly difficultyButtons = new Map<Difficulty, HTMLButtonElement>();
  private readonly difficultyHintEl: HTMLParagraphElement;
  private profileActiveEl!: HTMLSpanElement;
  private profileStatusEl!: HTMLParagraphElement;
  private profileInput!: HTMLInputElement;
  private profileSaveBtn!: HTMLButtonElement;
  private profileResetBtn!: HTMLButtonElement;
  private nextLaunchEl!: HTMLParagraphElement;
  private readonly profileStore = new ProfileStore();
  private readonly launchBtn: HTMLButtonElement;
  private readonly loadingLabel: HTMLSpanElement;
  private readonly loadingCount: HTMLSpanElement;
  private readonly loadingBar: HTMLSpanElement;
  private readonly loadingWrap: HTMLDivElement;
  private readonly settingsControlsEl: HTMLParagraphElement;
  private readonly languageToggleBtn: HTMLButtonElement;
  private readonly soundToggleBtn: HTMLButtonElement;
  private readonly hapticsToggleBtn: HTMLButtonElement;
  private readonly fpsToggleBtn: HTMLButtonElement;
  private readonly creditsLinkEl: HTMLButtonElement;
  private readonly creditsOverlay: HTMLDivElement;
  private readonly creditsCloseEl: HTMLButtonElement;

  private ships: readonly ShipDefinition[] = [];
  private selectedId = '';
  private difficulty: Difficulty = DEFAULT_DIFFICULTY;
  private mode: Mode = 'solo';
  private section: MenuSection = 'play';
  private ready = false;
  private touchCapable = false;
  private soundEnabled = true;
  private hapticsEnabled = true;
  private fpsEnabled = false;
  private creditsOpen = false;
  private visible = false;

  private readonly onCreditsKey = (event: KeyboardEvent): void => {
    if (!this.creditsOpen || event.code !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.showCredits(false);
  };

  private readonly onMenuKey = (event: KeyboardEvent): void => {
    if (!this.visible || this.creditsOpen) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }
    if (event.code === 'Escape') {
      if (this.section !== 'play') {
        event.preventDefault();
        this.setSection('play');
      }
      return;
    }
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
      event.preventDefault();
      this.cycleShip(event.code === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      if (target && (target.tagName === 'BUTTON' || target.tagName === 'A')) return;
      if (this.ready && this.selected) {
        event.preventDefault();
        this.callbacks.onLaunch();
      }
    }
  };

  public constructor(root: HTMLElement, i18n: I18n, callbacks: MenuCallbacks) {
    this.i18n = i18n;
    this.callbacks = callbacks;
    this.root = el('div', 'menu screen');
    this.root.setAttribute('aria-hidden', 'true');

    const veil = el('div', 'menu__veil');

    const topbar = el('header', 'menu__topbar');
    const brand = el('div', 'brand');
    brand.append(
      this.localized('span', 'brand__phase', 'app.phase'),
      this.localized('h1', 'brand__title', 'app.title'),
      this.localized('span', 'brand__alt', 'app.titleAr'),
    );
    const tools = el('div', 'menu__tools');
    this.languageButton = this.makeIconButton(ICONS.language, () =>
      this.callbacks.onToggleLanguage(),
    );
    this.soundButton = this.makeIconButton(ICONS.sound, () => this.callbacks.onToggleSound());
    this.hapticsButton = this.makeIconButton(ICONS.vibrate, () => this.callbacks.onToggleHaptics());
    tools.append(this.languageButton, this.soundButton, this.hapticsButton);
    topbar.append(brand, tools);

    const body = el('div', 'menu__body');

    const rail = el('nav', 'menu__rail');
    for (const entry of RAIL) {
      const button = el('button', 'rail-item');
      button.type = 'button';
      const iconSlot = el('span', 'rail-item__icon');
      iconSlot.appendChild(createIcon(entry.icon));
      button.append(iconSlot, this.localized('span', 'rail-item__label', entry.key));
      button.addEventListener('click', () => this.activate(entry.id));
      this.railButtons.set(entry.id, button);
      rail.appendChild(button);
    }

    const stage = el('div', 'menu__stage');
    const sections = el('div', 'menu__sections');

    const play = this.buildSection('play', 'menu.mode', 'menu.play.title', 'menu.play.subtitle');
    const modeGrid = el('div', 'mode-grid');
    const solo = el('button', 'mode-card is-selected');
    solo.type = 'button';
    solo.append(
      this.localized('span', 'mode-card__title', 'menu.mode.solo'),
      this.localized('span', 'mode-card__desc', 'menu.mode.soloDesc'),
    );
    solo.addEventListener('click', () => this.selectMode('solo'));
    const multi = el('button', 'mode-card mode-card--locked');
    multi.type = 'button';
    multi.disabled = true;
    multi.append(
      this.localized('span', 'mode-card__title', 'menu.mode.multi'),
      this.localized('span', 'mode-card__desc', 'menu.mode.multiDesc'),
      this.localized('span', 'mode-card__badge', 'menu.mode.comingSoon'),
    );
    this.modeButtons.set('solo', solo);
    this.modeButtons.set('multi', multi);
    modeGrid.append(solo, multi);

    const difficulty = el('div', 'menu__difficulty');
    difficulty.append(this.localized('h3', 'menu__difficulty-title', 'menu.difficulty'));
    const difficultyOptions = el('div', 'difficulty-select');
    difficultyOptions.setAttribute('role', 'group');
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const button = el('button', 'difficulty-option');
      button.type = 'button';
      button.dataset.difficulty = level;
      button.textContent = i18n.t(`difficulty.${level}` as StringKey);
      button.addEventListener('click', () => this.callbacks.onSelectDifficulty(level));
      difficultyOptions.appendChild(button);
      this.difficultyButtons.set(level, button);
    }
    this.difficultyHintEl = el('p', 'menu__difficulty-hint');
    difficulty.append(difficultyOptions, this.difficultyHintEl);

    const profile = this.buildProfilePanel();
    this.launchBtn = el('button', 'launch-button menu__launch');
    this.launchBtn.type = 'button';
    this.launchBtn.disabled = true;
    const launchLabel = this.localized('span', 'launch-button__label', 'menu.launch');
    const launchArrow = el('span', 'launch-button__arrow');
    launchArrow.appendChild(createIcon(ICONS.arrow));
    this.launchBtn.append(launchLabel, launchArrow);
    this.launchBtn.addEventListener('click', () => this.callbacks.onLaunch());

    this.loadingWrap = el('div', 'menu__loading');
    const loadingTop = el('div', 'menu__loading-top');
    this.loadingLabel = el('span', 'menu__loading-label');
    this.loadingCount = el('span', 'menu__loading-count');
    loadingTop.append(this.loadingLabel, this.loadingCount);
    const loadingTrack = el('div', 'menu__loading-track');
    this.loadingBar = el('span', 'menu__loading-bar');
    loadingTrack.appendChild(this.loadingBar);
    this.loadingWrap.append(loadingTop, loadingTrack);

    this.nextLaunchEl = el('p', 'menu__next-launch');
    play.append(modeGrid, difficulty, profile, this.nextLaunchEl, this.loadingWrap);
    this.sectionEls.get('play')?.appendChild(this.launchBtn);

    const hangar = this.buildSection(
      'hangar',
      'menu.nav.hangar',
      'menu.hangar.title',
      'menu.hangar.subtitle',
    );
    const detail = el('div', 'hangar-detail');
    const detailHead = el('div', 'hangar-detail__head');
    const detailNames = el('div', 'hangar-detail__names');
    this.detailName = el('span', 'hangar-detail__name');
    this.detailRole = el('span', 'hangar-detail__role');
    detailNames.append(this.detailName, this.detailRole);
    this.detailSlots = el('div', 'hangar-detail__slots');
    detailHead.append(detailNames, this.detailSlots);
    this.detailLore = el('p', 'hangar-detail__lore');
    this.detailBars = el('div', 'hangar-detail__bars');
    detail.append(detailHead, this.detailLore, this.detailBars);
    hangar.appendChild(detail);

    const settings = this.buildSection(
      'settings',
      'menu.nav.settings',
      'menu.settings.title',
      'menu.settings.subtitle',
    );
    const settingsGrid = el('div', 'settings-grid');
    this.languageToggleBtn = el('button', 'toggle-button');
    this.languageToggleBtn.type = 'button';
    this.languageToggleBtn.addEventListener('click', () => this.callbacks.onToggleLanguage());
    this.soundToggleBtn = el('button', 'toggle-button');
    this.soundToggleBtn.type = 'button';
    this.soundToggleBtn.addEventListener('click', () => this.callbacks.onToggleSound());
    this.hapticsToggleBtn = el('button', 'toggle-button');
    this.hapticsToggleBtn.type = 'button';
    this.hapticsToggleBtn.addEventListener('click', () => this.callbacks.onToggleHaptics());
    this.fpsToggleBtn = el('button', 'toggle-button');
    this.fpsToggleBtn.type = 'button';
    this.fpsToggleBtn.addEventListener('click', () => this.callbacks.onToggleFps());
    settingsGrid.append(this.languageToggleBtn, this.soundToggleBtn, this.hapticsToggleBtn, this.fpsToggleBtn);
    const controlsBlock = el('div', 'controls-block');
    controlsBlock.append(
      this.localized('h3', 'controls-block__title', 'menu.settings.controls'),
      (this.settingsControlsEl = el('p', 'controls-block__text')),
    );
    settings.append(settingsGrid, controlsBlock);

    const fitting = this.buildSection(
      'fitting',
      'menu.nav.fitting',
      'menu.fitting.title',
      'menu.fitting.subtitle',
    );
    const fittingBody = el('p', 'menu-panel__body');
    fittingBody.dataset.i18n = 'menu.fitting.body';
    fittingBody.textContent = i18n.t('menu.fitting.body');
    this.fittingSlots = el('div', 'slot-chips');
    const openFittingBtn = el('button', 'toggle-button');
    openFittingBtn.type = 'button';
    openFittingBtn.textContent = i18n.t('menu.nav.fitting');
    openFittingBtn.addEventListener('click', () => {
      this.openFittingPanel();
    });
    fitting.append(fittingBody, this.fittingSlots, openFittingBtn);

    for (const section of this.sectionEls.values()) sections.appendChild(section);

    this.carouselHost = el('div', 'hangar-carousel');

    const statusbar = el('footer', 'menu__statusbar');
    const statusLeft = el('div', 'menu__status-left');
    statusLeft.append(
      this.localized('span', 'menu__version', 'menu.version'),
      this.localized('span', 'menu__hint', 'menu.hint.keys'),
    );
    this.creditsLinkEl = el('button', 'menu__credits-link');
    this.creditsLinkEl.type = 'button';
    this.creditsLinkEl.dataset.i18n = 'menu.creditsLink';
    this.creditsLinkEl.textContent = i18n.t('menu.creditsLink');
    this.creditsLinkEl.addEventListener('click', () => this.showCredits(true));
    statusbar.append(statusLeft, this.creditsLinkEl);

    stage.append(sections, this.carouselHost, statusbar);
    body.append(rail, stage);
    this.root.append(veil, topbar, body);

    this.creditsOverlay = el('div', 'modal');
    this.creditsOverlay.hidden = true;
    const card = el('div', 'modal__card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    const closeTop = el('button', 'icon-button modal__close');
    closeTop.type = 'button';
    closeTop.appendChild(createIcon(ICONS.close));
    closeTop.addEventListener('click', () => this.showCredits(false));
    this.creditsCloseEl = el('button', 'ghost-button modal__action');
    this.creditsCloseEl.type = 'button';
    this.creditsCloseEl.dataset.i18n = 'common.close';
    this.creditsCloseEl.textContent = i18n.t('common.close');
    this.creditsCloseEl.addEventListener('click', () => this.showCredits(false));
    card.append(
      closeTop,
      this.localized('h2', 'modal__title', 'menu.creditsTitle'),
      this.localized('p', 'modal__text', 'menu.creditsBody'),
      this.localized('p', 'modal__text modal__text--dim', 'menu.creditsStack'),
      this.localized('p', 'modal__text modal__text--dim', 'menu.creditsAssets'),
      this.creditsCloseEl,
    );
    this.creditsOverlay.appendChild(card);
    this.creditsOverlay.addEventListener('pointerdown', (event) => {
      if (event.target === this.creditsOverlay) this.showCredits(false);
    });
    this.root.appendChild(this.creditsOverlay);

    root.appendChild(this.root);
    window.addEventListener('keydown', this.onCreditsKey, true);
    window.addEventListener('keydown', this.onMenuKey);
    this.refresh();
  }

  public get selected(): ShipDefinition | null {
    return this.ships.find((ship) => ship.id === this.selectedId) ?? null;
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public setShips(ships: readonly ShipDefinition[]): void {
    this.ships = ships;
    if (!this.selectedId && ships.length > 0) this.selectedId = ships[0]!.id;
    this.renderCards();
    this.updateSelection();
  }

  public selectShip(id: string): void {
    this.selectedId = id;
    this.updateSelection();
  }

  public setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    for (const [level, button] of this.difficultyButtons) {
      const active = level === difficulty;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
    this.difficultyHintEl.textContent = this.i18n.t(
      `difficulty.${difficulty}Hint` as StringKey,
    );
  }

  public setLoading(progress: number, loaded: number, total: number): void {
    const pct = Math.round(clamp(progress, 0, 1) * 100);
    this.loadingBar.style.width = `${pct}%`;
    this.loadingCount.textContent = this.i18n.t('menu.loadingCount', { loaded, total });
    if (!this.ready) this.loadingLabel.textContent = this.i18n.t('menu.loading');
  }

  public setReady(ready: boolean): void {
    this.ready = ready;
    this.loadingWrap.classList.toggle('is-ready', ready);
    if (ready) {
      this.loadingBar.style.width = '100%';
      this.loadingCount.textContent = '';
    }
    this.loadingLabel.textContent = this.i18n.t(ready ? 'menu.ready' : 'menu.loading');
    this.launchBtn.disabled = !ready || !this.selected;
  }

  public setTouchCapable(touchCapable: boolean): void {
    this.touchCapable = touchCapable;
    this.refreshControls();
  }

  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    this.updateToggles();
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
    this.updateToggles();
  }

  public setFpsEnabled(enabled: boolean): void {
    this.fpsEnabled = enabled;
    this.updateToggles();
  }

  public show(): void {
    this.visible = true;
    this.root.classList.add('is-active');
    this.root.setAttribute('aria-hidden', 'false');
    this.syncProfile();
    this.setSection(this.section);
  }

  private fittingPanelEl: HTMLElement | null = null;
  
  private openFittingPanel(): void {
    if (this.fittingPanelEl) {
      this.fittingPanelEl.remove();
      this.fittingPanelEl = null;
    }
    void import('./FittingPanel').then(({ FittingPanel }) => {
      const ship = this.ships.find((s) => s.id === this.selectedId) ?? this.ships[0];
      const profile = this.profileStore.getActive();
      const owned = profile?.ownedModules;
      const fittedModuleCounts: Record<string, number> = {};
      for (const list of Object.values(profile?.fittedModules ?? {})) {
        for (const fitted of list) {
          fittedModuleCounts[fitted.moduleId] = (fittedModuleCounts[fitted.moduleId] ?? 0) + 1;
        }
      }
      const panel = new FittingPanel({
        shipId: this.selectedId,
        loadout: ship.loadout,
        i18n: this.i18n,
        ownedCounts: owned,
        fittedModuleCounts,
        onClose: () => {
          if (this.fittingPanelEl) {
            this.fittingPanelEl.remove();
            this.fittingPanelEl = null;
          }
        },
        onSellModule: (moduleId, qty) => {
          this.callbacks.onSellModule?.(moduleId, qty);
          this.syncProfile();
        },
        onApply: (loadout) => {
          ship.loadout = loadout;
          this.callbacks.onSelectShip(ship.id);
          this.callbacks.onFitApplied?.(this.selectedId, loadout);
        },
      });
      this.fittingPanelEl = panel.getElement();
      this.fittingPanelEl.style.position = 'fixed';
      this.fittingPanelEl.style.top = '0';
      this.fittingPanelEl.style.left = '0';
      this.fittingPanelEl.style.width = '100vw';
      this.fittingPanelEl.style.height = '100vh';
      this.fittingPanelEl.style.zIndex = '10000';
      this.fittingPanelEl.style.background = 'rgba(0,10,20,0.95)';
      document.body.appendChild(this.fittingPanelEl);
    });
  }
  
  public hide(): void {
    this.visible = false;
    this.root.classList.remove('is-active');
    this.root.setAttribute('aria-hidden', 'true');
    this.showCredits(false);
    if (this.fittingPanelEl) {
      this.fittingPanelEl.remove();
      this.fittingPanelEl = null;
    }
  }

  public showCredits(open: boolean): void {
    this.creditsOpen = open;
    this.creditsOverlay.hidden = !open;
    this.root.classList.toggle('is-modal-open', open);
    if (open) this.creditsCloseEl.focus();
  }

  public refresh(): void {
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) {
      const key = node.dataset.i18n as StringKey;
      node.textContent = this.i18n.t(key);
    }
    for (const [level, button] of this.difficultyButtons) {
      button.textContent = this.i18n.t(`difficulty.${level}` as StringKey);
    }
    this.profileInput.placeholder = this.i18n.t('profile.placeholder');
    this.setDifficulty(this.difficulty);
    this.loadingLabel.textContent = this.i18n.t(this.ready ? 'menu.ready' : 'menu.loading');
    this.refreshControls();
    this.updateToggles();
    this.syncProfile();
    this.renderCards();
    this.updateSelection();
    this.setSection(this.section);
    this.updateNextLaunch();
  }

  public syncProfile(): void {
    const active = this.profileStore.getActive();
    if (active && !this.profileInput.value) this.profileInput.value = active.name;
    this.updateProfileSummary();
  }

  private updateProfileSummary(): void {
    const active = this.profileStore.getActive();
    if (active) {
      this.profileActiveEl.textContent = `${this.i18n.t('profile.active')}: ${active.name}`;
      this.profileActiveEl.classList.add('is-set');
    } else {
      this.profileActiveEl.textContent = this.i18n.t('profile.empty');
      this.profileActiveEl.classList.remove('is-set');
    }
    this.updateNextLaunch();
  }

  private zoneName(zoneId: string): string {
    const lang = this.i18n.lang === 'ar' ? 'ar' : 'en';
    const planet = SOLAR_SYSTEM.planets.find((p) => p.id === zoneId);
    if (planet) return planet.name[lang];
    const zone = ZONES.find((z) => z.id === zoneId);
    if (zone) return zone.name[lang];
    return zoneId;
  }

  private updateNextLaunch(): void {
    if (!this.nextLaunchEl) return;
    const zoneId = this.profileStore.getActive()?.startingZone ?? 'nova-prime';
    this.nextLaunchEl.textContent = `${this.i18n.t('map.nextLaunch')}: ${this.zoneName(zoneId)}`;
  }

  private setProfileStatus(message: string, good: boolean): void {
    this.profileStatusEl.textContent = message;
    this.profileStatusEl.classList.add('is-visible');
    this.profileStatusEl.classList.toggle('is-good', good);
  }

  private saveProfile(): void {
    const name = this.profileInput.value.trim();
    if (!name) {
      this.setProfileStatus(this.i18n.t('profile.cleared'), false);
      this.profileInput.focus();
      return;
    }
    this.profileStore.createOrUpdate(name, {
      shipId: this.selectedId,
      difficulty: this.difficulty,
    });
    this.callbacks.onProfileChange(name);
    this.setProfileStatus(this.i18n.t('profile.saved'), true);
    this.updateProfileSummary();
  }

  private clearProfile(): void {
    this.profileStore.reset();
    this.profileInput.value = '';
    this.callbacks.onProfileChange(null);
    this.setProfileStatus(this.i18n.t('profile.cleared'), true);
    this.updateProfileSummary();
  }

  private refreshControls(): void {
    this.settingsControlsEl.textContent = this.i18n.t(
      this.touchCapable ? 'menu.controlsTouch' : 'menu.controlsDesktop',
    );
  }

  private updateToggles(): void {
    const soundLabel = this.i18n.t(this.soundEnabled ? 'menu.soundOn' : 'menu.soundOff');
    const hapticsLabel = this.i18n.t(this.hapticsEnabled ? 'menu.hapticsOn' : 'menu.hapticsOff');
    const fpsLabel = this.i18n.t(this.fpsEnabled ? 'settings.showFpsOn' : 'settings.showFpsOff');
    const languageLabel = this.i18n.t('menu.languageAria');

    for (const [button, label, pressed] of [
      [this.soundButton, soundLabel, this.soundEnabled],
      [this.hapticsButton, hapticsLabel, this.hapticsEnabled],
      [this.languageButton, languageLabel, false],
    ] as const) {
      button.setAttribute('aria-label', label);
      button.title = label;
      if (button !== this.languageButton) setPressed(button, pressed);
    }

    this.languageToggleBtn.textContent = `${languageLabel}: ${this.i18n.t('menu.language')}`;
    this.soundToggleBtn.textContent = soundLabel;
    this.hapticsToggleBtn.textContent = hapticsLabel;
    this.fpsToggleBtn.textContent = fpsLabel;
    this.soundToggleBtn.setAttribute('aria-pressed', String(this.soundEnabled));
    this.hapticsToggleBtn.setAttribute('aria-pressed', String(this.hapticsEnabled));
    this.fpsToggleBtn.setAttribute('aria-pressed', String(this.fpsEnabled));
  }

  private renderCards(): void {
    clear(this.carouselHost);
    for (const [index, ship] of this.ships.entries()) {
      const name = ship.name[this.i18n.lang];
      const card = el('button', 'carousel-card');
      card.type = 'button';
      card.dataset.shipId = ship.id;
      card.style.setProperty('--ship-accent', ship.accent);
      card.setAttribute('aria-label', this.i18n.t('a11y.shipCard', { name }));

      const top = el('span', 'carousel-card__top');
      top.append(
        el('span', 'carousel-card__index', String(index + 1).padStart(2, '0')),
        el('span', 'carousel-card__role', this.i18n.t(ROLE_KEYS[ship.hullClass])),
      );
      const bars = el('span', 'carousel-card__bars');
      for (const value of metricsFor(ship)) {
        const bar = el('span', 'mini-bar');
        const fill = el('span', 'mini-bar__fill');
        fill.style.width = `${value}%`;
        bar.appendChild(fill);
        bars.appendChild(bar);
      }
      card.append(
        top,
        el('span', 'carousel-card__name', name),
        el('span', 'carousel-card__desc', ship.lore[this.i18n.lang]),
        bars,
        el(
          'span',
          'carousel-card__meta',
          `HIGH ${ship.highSlots} · MID ${ship.midSlots} · LOW ${ship.lowSlots}`,
        ),
      );
      card.classList.toggle('is-selected', ship.id === this.selectedId);
      card.setAttribute('aria-pressed', String(ship.id === this.selectedId));
      card.addEventListener('click', () => this.callbacks.onSelectShip(ship.id));
      this.carouselHost.appendChild(card);
    }
  }

  private updateSelection(): void {
    const ship = this.selected;
    if (!ship) {
      this.launchBtn.disabled = true;
      return;
    }

    this.detailName.textContent = ship.name[this.i18n.lang];
    this.detailRole.textContent = this.i18n.t(ROLE_KEYS[ship.hullClass]);
    this.detailLore.textContent = ship.lore[this.i18n.lang];
    this.detailSlots.textContent = `HIGH ${ship.highSlots} · MID ${ship.midSlots} · LOW ${ship.lowSlots}`;
    this.detailBars.style.setProperty('--bar-accent', ship.accent);

    clear(this.detailBars);
    const values = metricsFor(ship);
    METRIC_KEYS.forEach((key, index) => {
      const value = values[index] ?? 0;
      const row = el('div', 'stat-bar');
      const label = this.localized('span', 'stat-bar__label', key);
      const track = el('span', 'stat-bar__track');
      const fill = el('span', 'stat-bar__fill');
      fill.style.width = `${value}%`;
      track.appendChild(fill);
      row.append(label, track, el('span', 'stat-bar__value', String(value)));
      this.detailBars.appendChild(row);
    });

    clear(this.fittingSlots);
    for (const [label, count] of [
      ['HIGH', ship.highSlots],
      ['MID', ship.midSlots],
      ['LOW', ship.lowSlots],
    ] as const) {
      this.fittingSlots.appendChild(el('span', 'slot-chip', `${label} ${count}`));
    }

    for (const card of this.carouselHost.querySelectorAll<HTMLElement>('.carousel-card')) {
      const active = card.dataset.shipId === ship.id;
      card.classList.toggle('is-selected', active);
      card.setAttribute('aria-pressed', String(active));
    }

    if (this.visible) {
      const active = this.carouselHost.querySelector<HTMLElement>(
        `[data-ship-id="${ship.id}"]`,
      );
      if (active) {
        this.carouselHost.scrollTo({
          left: active.offsetLeft - (this.carouselHost.clientWidth - active.clientWidth) / 2,
          behavior: 'smooth',
        });
      }
    }

    this.launchBtn.disabled = !this.ready;
  }

  private cycleShip(direction: number): void {
    if (this.ships.length === 0) return;
    const current = this.ships.findIndex((ship) => ship.id === this.selectedId);
    const next =
      (current + direction + this.ships.length) % this.ships.length;
    const ship = this.ships[next];
    if (ship) this.callbacks.onSelectShip(ship.id);
  }

  private selectMode(mode: Mode): void {
    this.mode = mode;
    for (const [id, button] of this.modeButtons) {
      const active = id === this.mode;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  private activate(id: RailAction): void {
    if (id === 'credits') {
      this.showCredits(true);
      return;
    }
    if (id === 'map') {
      this.callbacks.onOpenMap();
      return;
    }
    if (id === 'market') {
      this.callbacks.onOpenMarket();
      return;
    }
    if (id === 'colony') {
      this.callbacks.onOpenColony();
      return;
    }
    if (id === 'codex') {
      this.callbacks.onOpenCodex();
      return;
    }
    this.setSection(id);
  }

  private setSection(section: MenuSection): void {
    this.section = section;
    for (const [id, button] of this.railButtons) {
      const active = id === section;
      button.classList.toggle('is-selected', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    for (const [id, node] of this.sectionEls) {
      const active = id === section;
      node.hidden = !active;
      node.classList.toggle('is-active', active);
    }
  }

  private localized(
    tag: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'label',
    className: string,
    key: StringKey,
  ): HTMLElement {
    const node = el(tag, className);
    node.dataset.i18n = key;
    node.textContent = this.i18n.t(key);
    return node;
  }

  private makeIconButton(icon: string, onClick: () => void): HTMLButtonElement {
    const button = el('button', 'icon-button menu__tool');
    button.type = 'button';
    button.appendChild(createIcon(icon));
    button.addEventListener('click', onClick);
    return button;
  }

  private buildSection(
    section: MenuSection,
    kickerKey: StringKey,
    titleKey: StringKey,
    subtitleKey: StringKey,
  ): HTMLElement {
    const rootEl = el('section', 'menu__section');
    rootEl.dataset.section = section;
    rootEl.hidden = section !== this.section;
    const panel = el('div', 'menu-panel');
    const head = el('div', 'menu-panel__head');
    head.append(
      this.localized('p', 'menu-panel__kicker', kickerKey),
      this.localized('h2', 'menu-panel__title', titleKey),
      this.localized('p', 'menu-panel__subtitle', subtitleKey),
    );
    panel.appendChild(head);
    rootEl.appendChild(panel);
    this.sectionEls.set(section, rootEl);
    return panel;
  }

  private buildProfilePanel(): HTMLElement {
    const panel = el('div', 'profile-panel');
    const head = el('div', 'profile-panel__head');
    this.profileActiveEl = el('span', 'profile-panel__active');
    head.append(this.localized('h3', 'profile-panel__title', 'profile.title'), this.profileActiveEl);

    const field = el('div', 'profile-field');
    const label = this.localized('label', 'profile-field__label', 'profile.nameLabel');
    this.profileInput = el('input', 'profile-input');
    this.profileInput.type = 'text';
    this.profileInput.maxLength = 24;
    this.profileInput.setAttribute('autocomplete', 'nickname');
    this.profileInput.spellcheck = false;
    label.setAttribute('for', 'menu-pilot-name');
    this.profileInput.id = 'menu-pilot-name';
    field.append(label, this.profileInput);

    const buttons = el('div', 'profile-btns');
    this.profileSaveBtn = el('button', 'toggle-button profile-save');
    this.profileSaveBtn.type = 'submit';
    this.profileSaveBtn.dataset.i18n = 'profile.save';
    this.profileSaveBtn.textContent = this.i18n.t('profile.save');
    this.profileResetBtn = el('button', 'toggle-button profile-reset');
    this.profileResetBtn.type = 'button';
    this.profileResetBtn.dataset.i18n = 'profile.reset';
    this.profileResetBtn.textContent = this.i18n.t('profile.reset');
    this.profileResetBtn.addEventListener('click', () => this.clearProfile());
    buttons.append(this.profileSaveBtn, this.profileResetBtn);

    const form = el('form', 'profile-form');
    form.append(field, buttons);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.saveProfile();
    });

    this.profileStatusEl = el('p', 'profile-status');
    panel.append(
      head,
      this.localized('p', 'profile-panel__subtitle', 'profile.subtitle'),
      form,
      this.profileStatusEl,
      this.localized('p', 'profile-hint', 'profile.hint'),
    );
    return panel;
  }
}
