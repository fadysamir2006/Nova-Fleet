import { RESOURCES, RESOURCE_ORDER } from '../assets-config';
import { forwardOf } from '../game/math';
import type { ResourceKind, ShipEntity, SimulationSnapshot } from '../game/types';
import type { RenderStats, ScreenPoint } from '../render/GameRenderer';
import { createIcon, el, formatNumber, ICONS } from './dom';
import type { I18n, StringKey } from './i18n';
import {
  attachTooltip,
  createBar,
  createButton,
  createIconButton,
  createPanel,
  createRing,
  createTabs,
  type BarHandle,
  type RingArcHandle,
  type TabsHandle,
} from './kit';

export type OverviewKind = 'hostile' | 'asteroid' | 'structure';
export type OverviewFilter = OverviewKind | 'all';
export type ObjectAction = 'approach' | 'lock' | 'fire' | 'mine' | 'orbit' | 'warp';

export interface OverviewObject {
  key: string;
  kind: OverviewKind;
  id: number | string;
  name: string;
  detail: string;
  distance: number;
  color: string;
  /** 0…1 health or resource ratio shown in the selected card. */
  ratio?: number;
}

export interface HudCallbacks {
  onPause: () => void;
  onMap: () => void;
  onColony: () => void;
  onMarket: () => void;
  onCodex: () => void;
  onSkipTutorial: () => void;
  /** 4D-fix round 2: claim a ready station mission from the HUD. */
  onClaimMission?: (missionId: string) => void;
  onSelectObject: (object: OverviewObject) => void;
  onObjectAction: (action: ObjectAction, object: OverviewObject) => void;
  onThrottle: (value: number) => void;
}

export interface TargetIndicator {
  label: string;
  color: string;
  distance: number;
  point: ScreenPoint;
}

export interface EnemyMarker {
  id: number;
  distance: number;
  x: number;
  y: number;
  edge: boolean;
  angle: number;
  locked: boolean;
}

export interface CombatTargetIndicator {
  label: string;
  distance: number;
  lead: ScreenPoint | null;
}

export interface TutorialState {
  visible: boolean;
  hitEnemy: boolean;
  minedOre: boolean;
}

/** 4D-fix round 2: one accepted station mission shown in the HUD. */
export interface MissionCard {
  id: string;
  label: string;
  current: number;
  amount: number;
  ready: boolean;
}

interface MarkerNodes {
  root: HTMLDivElement;
  label: HTMLSpanElement;
  distance: HTMLSpanElement;
  arrow: HTMLSpanElement;
}

interface TargetCardRefs {
  root: HTMLDivElement;
  name: HTMLElement;
  distance: HTMLElement;
  hullBar: BarHandle;
  shieldBar: BarHandle;
}

interface OverviewRowRefs {
  root: HTMLButtonElement;
  name: HTMLElement;
  detail: HTMLElement;
  distance: HTMLElement;
  dot: HTMLElement;
  object: OverviewObject;
}

interface ModuleSlot {
  button: HTMLButtonElement;
  enabled: boolean;
  active: boolean;
}

const SYSTEMS = [
  { id: 'weapon', icon: ICONS.fire, label: 'hud.module.cannon', slot: 'high' },
  { id: 'mining', icon: ICONS.mine, label: 'hud.module.mining', slot: 'high' },
  { id: 'afterburner', icon: ICONS.boost, label: 'hud.module.afterburner', slot: 'mid' },
  { id: 'shield', icon: ICONS.shield, label: 'hud.module.shield', slot: 'mid' },
  { id: 'repair', icon: ICONS.wrench, label: 'hud.module.repair', slot: 'low' },
  { id: 'target', icon: ICONS.target, label: 'hud.module.target', slot: 'mid' },
  { id: 'cargo', icon: ICONS.box, label: 'hud.module.cargo', slot: 'low' },
  { id: 'scanner', icon: ICONS.scanner, label: 'hud.module.scanner', slot: 'mid' },
] as const;

type SystemId = (typeof SYSTEMS)[number]['id'];

const ACTION_KEYS: Record<ObjectAction, StringKey> = {
  approach: 'hud.action.approach',
  lock: 'hud.action.lock',
  fire: 'hud.action.fire',
  mine: 'hud.action.mine',
  orbit: 'hud.action.orbit',
  warp: 'hud.action.warp',
};

const ACTION_ICONS: Record<ObjectAction, string> = {
  approach: ICONS.arrow,
  lock: ICONS.target,
  fire: ICONS.fire,
  mine: ICONS.mine,
  orbit: ICONS.target,
  warp: ICONS.warp,
};

const KIND_LABELS: Record<OverviewKind, StringKey> = {
  hostile: 'hud.kind.hostile',
  asteroid: 'hud.kind.asteroid',
  structure: 'hud.kind.structure',
};

const KIND_ACTIONS: Record<OverviewKind, ObjectAction[]> = {
  hostile: ['approach', 'lock', 'fire'],
  asteroid: ['approach', 'mine'],
  structure: ['approach', 'orbit', 'warp'],
};

const writeText = (node: Element | null | undefined, value: string): void => {
  if (node && node.textContent !== value) node.textContent = value;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const speedOf = (ship: ShipEntity): number =>
  Math.hypot(ship.velocity.x, ship.velocity.y, ship.velocity.z);

export class Hud {
  public readonly root: HTMLDivElement;
  public readonly touchLayer: HTMLDivElement;

  private i18n!: I18n;
  private callbacks!: HudCallbacks;

  private targetCards!: HTMLDivElement;
  private readonly cards = new Map<number, TargetCardRefs>();
  private readonly lockedIds: number[] = [];
  private scoreValue!: HTMLElement;
  private waveValue!: HTMLElement;
  private hostileValue!: HTMLElement;
  private pilotValue!: HTMLElement;
  private missionObjective!: HTMLElement;
  private activeMissionText: string | null = null;
  private missionTracks!: HTMLElement;
  private missionCardState: MissionCard[] = [];

  private radar!: HTMLCanvasElement;
  private radarContext!: CanvasRenderingContext2D | null;
  private radarRange!: HTMLElement;
  private incomingAlert!: HTMLElement;
  private capacitorAlert!: HTMLElement;
  private cargoAlert!: HTMLElement;

  private settingsButton!: HTMLButtonElement;
  private settingsBadge!: HTMLElement;
  private cargoBadge!: HTMLElement;

  private overview!: HTMLElement;
  private overviewBody!: HTMLDivElement;
  private overviewList!: HTMLDivElement;
  private overviewEmpty!: HTMLDivElement;
  private overviewCollapse!: HTMLButtonElement;
  private overviewTabs!: TabsHandle<OverviewFilter>;
  private readonly rows = new Map<string, OverviewRowRefs>();
  private selectedPanel!: HTMLDivElement;
  private selectedName!: HTMLElement;
  private selectedKind!: HTMLElement;
  private selectedDetail!: HTMLElement;
  private selectedDistance!: HTMLElement;
  private selectedBar!: BarHandle;
  private selectedActions!: HTMLDivElement;
  private selectedEmpty!: HTMLElement;
  private filter: OverviewFilter = 'all';
  private selectedObject: OverviewObject | null = null;
  private selectedKey = '';
  private selectedKindCache: OverviewKind | null = null;
  private overviewCollapsed = false;
  private overviewX = 0;
  private overviewY = 0;
  private drag: { startX: number; startY: number; x: number; y: number } | null = null;

  private shieldArc!: RingArcHandle;
  private armorArc!: RingArcHandle;
  private hullArc!: RingArcHandle;
  private capArc!: RingArcHandle;
  private shieldPct!: HTMLElement;
  private armorPct!: HTMLElement;
  private hullPct!: HTMLElement;
  private capValue!: HTMLElement;
  private armorRatio = 1;
  private readonly modules = new Map<SystemId, ModuleSlot>();
  private readonly systemFlash: Partial<Record<SystemId, number>> = {};

  private speedValue!: HTMLElement;
  private throttleInput!: HTMLInputElement;
  private throttleValue!: HTMLElement;

  private cargoPanel!: HTMLElement;
  private cargoTrack!: BarHandle;
  private cargoValue!: HTMLElement;
  private cargoCollapsed = false;
  private readonly resourceValues = new Map<ResourceKind, HTMLElement>();
  private readonly resourceLabels = new Map<ResourceKind, HTMLElement>();
  private readonly resourceRows = new Map<ResourceKind, HTMLElement>();
  private creditsValueEl!: HTMLElement;

  private targetLock!: HTMLDivElement;
  private targetMarker!: HTMLDivElement;
  private targetMarkerLabel!: HTMLElement;
  private targetMarkerDistance!: HTMLElement;
  private targetName!: HTMLElement;
  private targetRange!: HTMLElement;
  private targetTitle!: HTMLElement;
  private warning!: HTMLDivElement;
  private grace!: HTMLDivElement;
  private graceValue!: HTMLElement;
  private toasts!: HTMLDivElement;
  private readonly toastTimers: number[] = [];
  private debugPanel!: HTMLDivElement;
  private readonly debugValues = new Map<string, HTMLElement>();
  private fpsBadge!: HTMLDivElement;
  private fpsBadgeValue!: HTMLElement;
  private markerLayer!: HTMLDivElement;
  private readonly markers = new Map<number, MarkerNodes>();
  private leadIndicator!: HTMLDivElement;
  private damageArc!: HTMLDivElement;
  private tutorial!: HTMLDivElement;
  private readonly tutorialSteps: HTMLElement[] = [];
  private readonly labelled: Array<{ button: HTMLButtonElement; key: StringKey }> = [];

  private debugVisible = false;
  private audioEnabled = true;
  private visible = false;
  private damageTimer = 0;
  private incomingTimer = 0;
  private lastSnapshot: SimulationSnapshot | null = null;
  private lastTarget: TargetIndicator | null = null;
  private tutorialActive = false;

  constructor(root: HTMLElement, i18n: I18n, callbacks: HudCallbacks) {
    this.i18n = i18n;
    this.callbacks = callbacks;
    this.root = el('div', 'hud screen');
    this.root.setAttribute('aria-hidden', 'true');
    this.touchLayer = el('div', 'hud__touch');
    this.buildDom();
    root.appendChild(this.root);
    this.refresh();
    this.updateTarget(null);
    window.addEventListener('keydown', this.onSystemKey);
  }
  private buildDom(): void {
    const vignette = el('div', 'hud__vignette');
    const scanlines = el('div', 'hud__scanlines');

    const topLeft = el('div', 'hud-cluster hud-cluster--top-left');
    this.targetCards = el('div', 'hud-targets');
    this.targetCards.hidden = true;
    topLeft.append(this.targetCards, this.createMission());

    const topRight = el('div', 'hud-cluster hud-cluster--top-right');
    const creditsBox = el('div', 'hud-credits');
    const creditsLabel = this.localized('span', 'hud-credits__label', 'hud.credits');
    this.creditsValueEl = el('strong', 'hud-credits__value');
    this.creditsValueEl.textContent = '0';
    creditsBox.append(creditsLabel, this.creditsValueEl);
    topRight.append(creditsBox, this.createRadar(), this.createAlerts());

    const sidebar = this.createSidebar();
    const overview = this.createOverview();
    const bottomCenter = this.createCapacitor();
    const bottomLeft = this.createSpeed();
    const bottomRight = this.createCargo();

    const reticle = el('div', 'reticle');
    reticle.append(
      el('span', 'reticle__ring'),
      el('span', 'reticle__dot'),
      el('span', 'reticle__tick reticle__tick--top'),
      el('span', 'reticle__tick reticle__tick--bottom'),
      el('span', 'reticle__tick reticle__tick--left'),
      el('span', 'reticle__tick reticle__tick--right'),
    );

    const lock = el('div', 'hud__lock');
    lock.hidden = true;
    this.targetLock = lock;
    this.targetTitle = this.localized('span', 'hud__lock-title', 'hud.target');
    this.targetName = el('strong', 'hud__lock-name');
    this.targetRange = el('span', 'hud__lock-range');
    lock.append(this.targetTitle, this.targetName, this.targetRange);

    this.targetMarker = el('div', 'target-marker');
    this.targetMarker.hidden = true;
    const bracket = el('span', 'target-marker__bracket');
    const markerText = el('span', 'target-marker__text');
    this.targetMarkerLabel = el('strong', 'target-marker__label');
    this.targetMarkerDistance = el('span', 'target-marker__distance');
    markerText.append(this.targetMarkerLabel, this.targetMarkerDistance);
    this.targetMarker.append(bracket, markerText);

    this.leadIndicator = el('div', 'lead-indicator');
    this.leadIndicator.hidden = true;
    this.leadIndicator.append(
      el('span', 'lead-indicator__ring'),
      el('span', 'lead-indicator__dot'),
    );

    this.damageArc = el('div', 'damage-arc');
    this.damageArc.append(el('span', 'damage-arc__ring'));

    this.markerLayer = el('div', 'enemy-markers');

    this.grace = el('div', 'hud__grace');
    this.grace.hidden = true;
    this.graceValue = el('b', 'hud__grace-value', '15s');
    this.grace.append(this.localized('span', 'hud__grace-title', 'hud.grace'), this.graceValue);

    this.tutorial = this.createTutorial();

    this.warning = el('div', 'hud__warning');
    this.warning.append(
      this.localized('strong', 'hud__warning-title', 'hud.warning'),
      this.localized('span', 'hud__warning-body', 'hud.boundary'),
    );
    this.warning.hidden = true;

    this.toasts = el('div', 'hud__toasts');
    this.toasts.setAttribute('role', 'status');
    this.toasts.setAttribute('aria-live', 'polite');

    this.debugPanel = this.createDebugPanel();
    this.fpsBadge = el('div', 'hud-fps');
    this.fpsBadge.hidden = true;
    this.fpsBadgeValue = el('strong', 'hud-fps__value', '0');
    this.fpsBadge.append(this.localized('span', 'hud-fps__label', 'hud.fps'), this.fpsBadgeValue);

    this.root.append(
      vignette,
      scanlines,
      topLeft,
      topRight,
      sidebar,
      overview,
      bottomCenter,
      bottomLeft,
      bottomRight,
      reticle,
      lock,
      this.targetMarker,
      this.leadIndicator,
      this.damageArc,
      this.markerLayer,
      this.grace,
      this.tutorial,
      this.warning,
      this.toasts,
      this.debugPanel,
      this.fpsBadge,
      this.touchLayer,
    );
  }

  private localized<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    key: StringKey,
  ): HTMLElementTagNameMap[K] {
    const node = el(tag, className);
    node.dataset.i18n = key;
    node.textContent = this.i18n.t(key);
    return node;
  }

  private createMission(): HTMLElement {
    const panel = createPanel({ className: 'hud-mission', bodyLayout: 'contents' });
    const eyebrow = this.localized('span', 'hud-mission__eyebrow', 'hud.mission');
    this.missionObjective = el('strong', 'hud-mission__title');
    const meta = el('div', 'hud-mission__meta');
    this.scoreValue = el('b', 'hud-mission__value', '0');
    this.waveValue = el('b', 'hud-mission__value', '1');
    this.hostileValue = el('b', 'hud-mission__value', '0');
    this.pilotValue = el('b', 'hud-mission__value hud-mission__value--pilot', '—');
    const cell = (labelKey: StringKey, value: HTMLElement): HTMLElement => {
      const span = el('span', 'hud-mission__cell');
      span.append(this.localized('em', 'hud-mission__label', labelKey), value);
      return span;
    };
    meta.append(
      cell('hud.score', this.scoreValue),
      cell('hud.wave', this.waveValue),
      cell('hud.hostiles', this.hostileValue),
      cell('profile.active', this.pilotValue),
    );
    panel.body.append(eyebrow, this.missionObjective, meta);

    // 4D-fix round 2: live tracks for every accepted station mission
    // (title + progress bar + count, plus Claim reward when ready).
    this.missionTracks = el('div', 'hud-mission__tracks');
    panel.body.append(this.missionTracks);
    return panel.root;
  }

  private createRadar(): HTMLElement {
    const panel = el('div', 'hud-radar');
    const head = el('div', 'radar__head');
    this.radarRange = el('em', 'radar__range', '1.2 km');
    head.append(this.localized('span', 'radar__title', 'hud.radar'), this.radarRange);
    this.radar = el('canvas', 'radar__canvas');
    this.radar.width = 144;
    this.radar.height = 144;
    this.radarContext = this.radar.getContext('2d');
    panel.append(head, this.radar);
    return panel;
  }

  private createAlerts(): HTMLElement {
    const alerts = el('div', 'hud-alerts');
    const chip = (tone: string, key: StringKey, icon: string): HTMLDivElement => {
      const node = el('div', `hud-alert hud-alert--${tone}`);
      node.append(createIcon(icon), this.localized('span', 'hud-alert__text', key));
      return node;
    };
    this.incomingAlert = chip('incoming', 'hud.alert.incoming', ICONS.arrow);
    this.capacitorAlert = chip('capacitor', 'hud.alert.lowCapacitor', ICONS.boost);
    this.cargoAlert = chip('cargo', 'hud.cargoFull', ICONS.box);
    alerts.append(this.incomingAlert, this.capacitorAlert, this.cargoAlert);
    return alerts;
  }

  private createSidebar(): HTMLElement {
    const nav = el('nav', 'hud-sidebar');
    const addButton = (
      icon: string,
      labelKey: StringKey,
      onClick: () => void,
      badge?: string,
    ): { button: HTMLButtonElement; badge: HTMLElement | null } => {
      const button = createIconButton({
        icon,
        label: this.i18n.t(labelKey),
        className: 'hud-sidebar__button',
        onClick,
      });
      this.labelled.push({ button, key: labelKey });
      attachTooltip(button, () => this.i18n.t(labelKey), { placement: 'end' });
      let badgeNode: HTMLElement | null = null;
      if (badge) {
        badgeNode = el('em', 'hud-sidebar__badge', badge);
        button.appendChild(badgeNode);
      }
      nav.appendChild(button);
      return { button, badge: badgeNode };
    };
    addButton(ICONS.map, 'menu.nav.map', () => this.callbacks.onMap());
    addButton(ICONS.wrench, 'menu.nav.fitting', () => {
      this.toast(this.i18n.t('hud.fittingSoon'), 'info');
    }, 'P3');
    const cargo = addButton(ICONS.box, 'hud.cargo', () => this.toggleCargo(), '0%');
    this.cargoBadge = cargo.badge as HTMLElement;
    addButton(ICONS.colony, 'menu.nav.colony', () => this.callbacks.onColony());
    addButton(ICONS.market, 'menu.nav.market', () => this.callbacks.onMarket());
    addButton(ICONS.codex, 'menu.codex', () => this.callbacks.onCodex());
    const settings = addButton(ICONS.gear, 'menu.nav.settings', () => this.callbacks.onPause(), 'M');
    this.settingsButton = settings.button;
    this.settingsBadge = settings.badge as HTMLElement;
    this.settingsBadge.hidden = true;
    return nav;
  }
  private createOverview(): HTMLElement {
    const panel = createPanel({
      tag: 'section',
      className: 'hud-overview',
      header: el('div', 'hud-overview__head'),
      bodyClassName: 'hud-overview__body',
      bodyLayout: 'flow',
    });
    this.overview = panel.root;
    const head = panel.head as HTMLDivElement;
    const title = this.localized('strong', 'hud-overview__title', 'hud.overview');
    this.overviewCollapse = createIconButton({
      label: this.i18n.t('hud.collapse'),
      icon: ICONS.chevron,
      className: 'hud-overview__collapse',
      onClick: (event) => {
        event.stopPropagation();
        this.toggleOverview();
      },
    });
    attachTooltip(
      this.overviewCollapse,
      () => this.i18n.t(this.overviewCollapsed ? 'hud.expand' : 'hud.collapse'),
      { placement: 'bottom' },
    );
    head.append(title, this.overviewCollapse);
    head.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      if ((event.target as HTMLElement).closest('button')) return;
      this.drag = {
        startX: event.clientX,
        startY: event.clientY,
        x: this.overviewX,
        y: this.overviewY,
      };
      head.setPointerCapture(event.pointerId);
      this.overview.classList.add('is-dragging');
    });
    head.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      this.overviewX = this.drag.x + (event.clientX - this.drag.startX);
      this.overviewY = this.drag.y + (event.clientY - this.drag.startY);
      this.overview.style.transform = `translate3d(${this.overviewX}px, ${this.overviewY}px, 0)`;
    });
    const endDrag = (): void => {
      this.drag = null;
      this.overview.classList.remove('is-dragging');
    };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);

    const tabDefs = [
      ['all', 'hud.filter.all'],
      ['hostile', 'hud.filter.hostiles'],
      ['asteroid', 'hud.filter.mining'],
      ['structure', 'hud.filter.structures'],
    ] as const;
    this.overviewTabs = createTabs<OverviewFilter>({
      label: this.i18n.t('hud.overview'),
      value: this.filter,
      className: 'hud-overview__tabs',
      tabClassName: 'hud-overview__tab',
      items: tabDefs.map(([id, key]) => ({ id, label: this.i18n.t(key) })),
      onChange: (filter) => this.setFilter(filter),
    });
    for (const [filter, key] of tabDefs) {
      const tab = this.overviewTabs.buttons.get(filter);
      if (tab) tab.dataset.i18n = key;
    }

    this.overviewEmpty = this.localized('p', 'hud-overview__empty', 'hud.overviewEmpty');
    this.overviewList = el('div', 'hud-overview__list');

    this.selectedPanel = el('div', 'hud-selected is-empty');
    const selectedHead = el('div', 'hud-selected__head');
    this.selectedName = el('strong', 'hud-selected__name');
    this.selectedKind = el('span', 'hud-selected__kind');
    selectedHead.append(this.selectedName, this.selectedKind);
    const selectedMeta = el('div', 'hud-selected__meta');
    this.selectedDistance = el('span', 'hud-selected__distance');
    this.selectedDetail = el('span', 'hud-selected__detail');
    selectedMeta.append(this.selectedDistance, this.selectedDetail);
    this.selectedBar = createBar({
      className: 'hud-selected__bar',
      fillClassName: 'hud-selected__fill',
    });
    this.selectedActions = el('div', 'hud-selected__actions');
    this.selectedEmpty = this.localized('p', 'hud-selected__empty', 'hud.noSelection');
    this.selectedPanel.append(
      selectedHead,
      selectedMeta,
      this.selectedBar.root,
      this.selectedActions,
      this.selectedEmpty,
    );

    this.overviewBody = panel.body;
    this.overviewBody.append(
      this.overviewTabs.root,
      this.overviewEmpty,
      this.overviewList,
      this.selectedPanel,
    );

    this.overviewCollapsed = document.body.classList.contains('touch-capable');
    this.overview.classList.toggle('is-collapsed', this.overviewCollapsed);
    this.updateOverviewChrome();
    return this.overview;
  }

  private updateOverviewChrome(): void {
    const label = this.i18n.t(this.overviewCollapsed ? 'hud.expand' : 'hud.collapse');
    this.overviewCollapse.setAttribute('aria-label', label);
    this.overviewCollapse.setAttribute('aria-expanded', String(!this.overviewCollapsed));
    this.overview.classList.toggle('is-collapsed', this.overviewCollapsed);
  }

  private toggleOverview(): void {
    this.overviewCollapsed = !this.overviewCollapsed;
    this.updateOverviewChrome();
  }

  private createCapacitor(): HTMLElement {
    const cluster = el('div', 'hud-cluster hud-cluster--bottom-center');
    const cap = el('div', 'hud-cap');
    const ring = createRing({
      viewBox: 220,
      className: 'hud-cap__svg',
      arcs: [
        { radius: 96, className: 'hud-cap__arc is-shield' },
        { radius: 84, className: 'hud-cap__arc is-armor' },
        { radius: 72, className: 'hud-cap__arc is-hull' },
        { radius: 58, className: 'hud-cap__arc is-cap' },
      ],
    });
    [this.shieldArc, this.armorArc, this.hullArc, this.capArc] = ring.arcs as [
      RingArcHandle,
      RingArcHandle,
      RingArcHandle,
      RingArcHandle,
    ];
    const svg = ring.root;

    const center = el('div', 'hud-cap__center');
    this.capValue = el('strong', 'hud-cap__value', '100%');
    center.append(this.capValue, this.localized('span', 'hud-cap__label', 'hud.capacitor'));
    const pcts = el('div', 'hud-cap__pcts');
    this.shieldPct = el('span', 'hud-cap__pct is-shield', 'SH 100%');
    this.armorPct = el('span', 'hud-cap__pct is-armor', 'AR 100%');
    this.hullPct = el('span', 'hud-cap__pct is-hull', 'HU 100%');
    pcts.append(this.shieldPct, this.armorPct, this.hullPct);
    center.appendChild(pcts);

    const rack = el('div', 'hud-rack');
    SYSTEMS.forEach((system, index) => {
      const label = this.i18n.t(system.label);
      const button = createIconButton({
        label: `${index + 1} · ${label}`,
        icon: system.icon,
        className: 'hud-module',
        onClick: () => this.toggleSystem(system.id),
      });
      button.setAttribute('aria-pressed', 'true');
      button.dataset.system = system.id;
      button.style.setProperty(
        '--slot-angle',
        `${-90 + (180 / (SYSTEMS.length - 1)) * index}deg`,
      );
      const key = el('span', 'hud-module__key', String(index + 1));
      button.appendChild(key);
      button.appendChild(el('span', 'hud-module__sweep'));
      attachTooltip(button, () => this.i18n.t(system.label), { placement: 'top' });
      this.labelled.push({ button, key: system.label });
      this.modules.set(system.id, { button, enabled: true, active: false });
      rack.appendChild(button);
    });

    cap.append(svg, center, rack);
    cluster.appendChild(cap);
    return cluster;
  }

  private createSpeed(): HTMLElement {
    const cluster = el('div', 'hud-cluster hud-cluster--bottom-left hud-speed');
    const main = el('div', 'hud-speed__main');
    this.speedValue = el('strong', 'hud-speed__value', '0');
    main.append(this.speedValue, this.localized('span', 'hud-speed__unit', 'hud.speed'));
    const throttle = el('label', 'hud-speed__throttle');
    this.throttleInput = el('input', 'hud-speed__range');
    this.throttleInput.type = 'range';
    this.throttleInput.min = '0';
    this.throttleInput.max = '100';
    this.throttleInput.step = '1';
    this.throttleInput.value = '0';
    this.throttleInput.setAttribute('aria-label', this.i18n.t('hud.throttle'));
    this.throttleValue = el('output', 'hud-speed__output', '0%');
    throttle.append(
      this.localized('span', 'hud-speed__label', 'hud.throttle'),
      this.throttleInput,
      this.throttleValue,
    );
    this.throttleInput.addEventListener('input', () => {
      const value = Number(this.throttleInput.value);
      this.throttleValue.textContent = `${Math.round(value)}%`;
      this.callbacks.onThrottle(value / 100);
    });
    cluster.append(main, throttle);
    return cluster;
  }

  private createCargo(): HTMLElement {
    const cluster = el('div', 'hud-cluster hud-cluster--bottom-right');
    const panel = createPanel({
      tag: 'section',
      className: 'hud-cargo',
      header: el('div', 'hud-cargo__head'),
      bodyLayout: 'contents',
    });
    this.cargoPanel = panel.root;
    const head = panel.head as HTMLDivElement;
    this.cargoValue = el('em', 'hud-cargo__value', '0 / 0');
    const toggle = createIconButton({
      label: this.i18n.t('hud.collapse'),
      icon: ICONS.chevron,
      className: 'hud-cargo__toggle',
      onClick: () => this.toggleCargo(),
    });
    toggle.setAttribute('data-cargo-toggle', 'true');
    attachTooltip(
      toggle,
      () => this.i18n.t(this.cargoCollapsed ? 'hud.expand' : 'hud.collapse'),
      { placement: 'start' },
    );
    head.append(
      this.localized('span', 'hud-cargo__title', 'hud.cargo'),
      this.cargoValue,
      toggle,
    );

    this.cargoTrack = createBar({
      className: 'hud-cargo__track',
      fillClassName: 'hud-cargo__fill',
      label: this.i18n.t('hud.cargo'),
    });

    const grid = el('div', 'hud-cargo__grid');
    for (const kind of RESOURCE_ORDER) {
      const row = el('span', 'hud-cargo__resource');
      row.dataset.resource = kind;
      const label = el('span', 'hud-cargo__name');
      this.resourceLabels.set(kind, label);
      const value = el('b', 'hud-cargo__amount', '0');
      this.resourceValues.set(kind, value);
      this.resourceRows.set(kind, row);
      row.append(el('i', 'hud-cargo__dot'), label, value);
      grid.appendChild(row);
    }

    panel.body.append(this.cargoTrack.root, grid);
    this.cargoCollapsed = document.body.classList.contains('touch-capable');
    this.cargoPanel.classList.toggle('is-collapsed', this.cargoCollapsed);
    this.updateCargoChrome();
    cluster.appendChild(this.cargoPanel);
    return cluster;
  }

  private updateCargoChrome(): void {
    const toggle = this.cargoPanel.querySelector<HTMLButtonElement>('[data-cargo-toggle]');
    if (toggle) {
      toggle.setAttribute(
        'aria-label',
        this.i18n.t(this.cargoCollapsed ? 'hud.expand' : 'hud.collapse'),
      );
      toggle.setAttribute('aria-expanded', String(!this.cargoCollapsed));
    }
    this.cargoPanel.classList.toggle('is-collapsed', this.cargoCollapsed);
  }

  private toggleCargo(): void {
    this.cargoCollapsed = !this.cargoCollapsed;
    this.updateCargoChrome();
  }

  private createTutorial(): HTMLDivElement {
    const tutorial = el('div', 'tutorial');
    tutorial.hidden = true;
    const head = el('div', 'tutorial__head');
    head.append(
      this.localized('strong', 'tutorial__title', 'tutorial.title'),
      (() => {
        const skip = el('button', 'tutorial__skip');
        skip.type = 'button';
        skip.textContent = this.i18n.t('tutorial.skip');
        skip.dataset.i18n = 'tutorial.skip';
        skip.addEventListener('click', () => this.callbacks.onSkipTutorial());
        return skip;
      })(),
    );
    const stepList = el('div', 'tutorial__steps');
    for (const key of ['tutorial.step1', 'tutorial.step2'] as const) {
      const step = el('div', 'tutorial__step');
      const index = el('span', 'tutorial__index');
      const text = this.localized('span', 'tutorial__text', key);
      step.append(index, text);
      stepList.appendChild(step);
      this.tutorialSteps.push(step);
    }
    const hint = this.localized('p', 'tutorial__hint', 'hud.targetCycleHint');
    tutorial.append(head, stepList, hint);
    return tutorial;
  }

  private createDebugPanel(): HTMLDivElement {
    const panel = el('div', 'debug-panel');
    panel.hidden = true;
    for (const key of [
      ['fps', 'hud.fps'],
      ['quality', 'hud.quality'],
      ['calls', 'hud.drawCalls'],
      ['tris', 'hud.triangles'],
      ['particles', 'hud.particles'],
      ['pixel', 'hud.pixelRatio'],
      ['enemies', 'hud.hostiles'],
      ['asteroids', 'hud.asteroids'],
      ['position', 'hud.position'],
    ] as const) {
      const row = el('div', 'debug-panel__row');
      const value = el('b', 'debug-panel__value', '—');
      this.debugValues.set(key[0], value);
      row.append(this.localized('span', 'debug-panel__label', key[1]), value);
      panel.appendChild(row);
    }
    return panel;
  }
  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.classList.toggle('is-active', visible);
    this.root.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (!visible) {
      this.clearToasts();
      this.targetLock.hidden = true;
      this.targetMarker.hidden = true;
      this.leadIndicator.hidden = true;
      this.grace.hidden = true;
      this.tutorial.hidden = true;
      this.warning.hidden = true;
      this.clearEnemyMarkers();
      this.root.classList.remove('is-critical', 'is-hit', 'is-boundary');
      this.damageArc.classList.remove('is-active');
      this.incomingAlert.classList.remove('is-visible');
      window.clearTimeout(this.incomingTimer);
    } else {
      this.throttleInput.value = '0';
      this.throttleValue.textContent = '0%';
    }
  }

  public get isVisible(): boolean {
    return this.visible;
  }

  public setPilotName(name: string | null): void {
    writeText(this.pilotValue, name ?? '—');
  }

  public setCredits(credits: number): void {
    if (this.creditsValueEl) writeText(this.creditsValueEl, formatNumber(Math.max(0, Math.floor(credits))));
  }

  /** Shows a floating credit-gain toast (e.g. "+1,500 cr"). */
  public creditToast(amount: number): void {
    if (amount <= 0) return;
    this.toast(`+${formatNumber(Math.floor(amount))} cr`, 'good');
  }

  /** Reflects the input-layer throttle (e.g. the Overview Approach action). */
  public setThrottle(value: number): void {
    const percent = Math.round(clamp01(value) * 100);
    this.throttleInput.value = String(percent);
    this.throttleValue.textContent = `${percent}%`;
  }

  /** HUD scale (0.8…1.3) and chrome opacity (0.4…1) from settings. */
  public setDisplay(scale: number, opacity: number): void {
    this.root.style.setProperty('--hud-scale', String(Math.max(0.8, Math.min(1.3, scale))));
    this.root.style.setProperty('--hud-opacity', String(Math.max(0.4, Math.min(1, opacity))));
  }

  /** Static armor rating (0…100) drives the middle arc. */
  public setArmorRating(rating: number): void {
    this.armorRatio = clamp01(rating / 100);
  }

  public setAudioEnabled(enabled: boolean): void {
    this.audioEnabled = enabled;
    this.settingsButton.classList.toggle('is-muted', !enabled);
    this.settingsBadge.hidden = enabled;
  }

  public setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    this.debugPanel.hidden = !visible;
  }

  public toggleDebug(): boolean {
    this.setDebugVisible(!this.debugVisible);
    return this.debugVisible;
  }

  public setFpsVisible(visible: boolean): void {
    if (this.fpsBadge) this.fpsBadge.hidden = !visible;
  }

  public resetSession(): void {
    for (const id of [...this.lockedIds]) this.removeTarget(id);
    this.targetCards.hidden = true;
    this.lastTarget = null;
    this.updateTarget(null);
    this.selectedObject = null;
    this.filter = 'all';
    this.overviewTabs.select('all', { notify: false });
    this.updateOverview([], null);
    this.throttleInput.value = '0';
    this.throttleValue.textContent = '0%';
    this.overviewX = 0;
    this.overviewY = 0;
    this.overview.style.transform = '';
    this.incomingAlert.classList.remove('is-visible');
    this.capacitorAlert.classList.remove('is-visible');
    this.cargoAlert.classList.remove('is-visible');
    this.tutorialActive = false;
  }

  public refresh(): void {
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) {
      const key = node.dataset.i18n as StringKey | undefined;
      if (key) node.textContent = this.i18n.t(key);
    }
    for (const kind of RESOURCE_ORDER) {
      writeText(this.resourceLabels.get(kind), this.i18n.resourceLabel(kind));
    }
    for (const entry of this.labelled) {
      entry.button.setAttribute('aria-label', this.i18n.t(entry.key));
    }
    this.cargoTrack.setLabel(this.i18n.t('hud.cargo'));
    for (const card of this.cards.values()) {
      card.shieldBar.setLabel(this.i18n.t('hud.shield'));
      card.hullBar.setLabel(this.i18n.t('hud.hull'));
    }
    this.targetTitle.textContent = this.i18n.t('hud.target');
    this.throttleInput.setAttribute('aria-label', this.i18n.t('hud.throttle'));
    this.updateOverviewChrome();
    this.updateCargoChrome();
    this.renderSelected(true);
    if (this.lastTarget) {
      this.updateTarget(this.lastTarget);
    } else {
      this.targetName.textContent = this.i18n.t('hud.noTarget');
      this.targetRange.textContent = this.i18n.t('hud.waiting');
    }
    if (this.lastSnapshot) {
      this.updateMission(this.lastSnapshot);
      this.updateTargetCards(this.lastSnapshot);
    }
    this.settingsBadge.hidden = this.audioEnabled;
  }

  public update(snapshot: SimulationSnapshot): void {
    this.lastSnapshot = snapshot;
    const player = snapshot.player;
    const hullRatio = player.maxHealth > 0 ? player.health / player.maxHealth : 0;
    const shieldRatio = player.maxShield > 0 ? player.shield / player.maxShield : 0;
    const capRatio = clamp01(player.boost / 100);
    this.updateArcs(hullRatio, shieldRatio, capRatio);
    this.root.classList.toggle('is-critical', hullRatio < 0.3 && player.alive);
    this.root.classList.toggle('is-low-cap', capRatio < 0.25 && player.alive);

    writeText(this.scoreValue, formatNumber(snapshot.score));
    writeText(this.waveValue, String(snapshot.wave));
    writeText(this.hostileValue, String(snapshot.enemies.filter((enemy) => enemy.alive).length));
    this.updateSpeed(snapshot);
    this.updateCargoPanel(snapshot);
    this.updateTargetCards(snapshot);
    this.updateMission(snapshot);
    this.updateAlerts(snapshot, capRatio);
    this.updateSystems(snapshot);

    this.warning.hidden = !snapshot.boundaryWarning;
    this.root.classList.toggle('is-boundary', snapshot.boundaryWarning);
    this.updateGrace(snapshot.graceRemaining);
    this.drawRadar(snapshot);
  }

  private updateArcs(hullRatio: number, shieldRatio: number, capRatio: number): void {
    this.shieldArc.set(shieldRatio);
    this.armorArc.set(this.armorRatio);
    this.hullArc.set(hullRatio);
    this.capArc.set(capRatio);
    writeText(this.shieldPct, `SH ${Math.round(shieldRatio * 100)}%`);
    writeText(this.armorPct, `AR ${Math.round(this.armorRatio * 100)}%`);
    writeText(this.hullPct, `HU ${Math.round(hullRatio * 100)}%`);
    writeText(this.capValue, `${Math.round(capRatio * 100)}%`);
  }

  private updateCargoPanel(snapshot: SimulationSnapshot): void {
    const cargo = snapshot.cargo;
    const ratio = cargo.capacity > 0 ? cargo.used / cargo.capacity : 0;
    this.cargoTrack.set(ratio);
    this.cargoTrack.root.classList.toggle('is-full', ratio >= 0.999);
    const percent = String(Math.round(ratio * 100));
    writeText(
      this.cargoValue,
      `${formatNumber(cargo.used, cargo.used < 10 && cargo.used > 0 ? 1 : 0)} / ${cargo.capacity}`,
    );
    writeText(this.cargoBadge, `${percent}%`);
    this.cargoBadge.hidden = cargo.used <= 0;
    for (const kind of RESOURCE_ORDER) {
      const amount = cargo.resources[kind];
      const node = this.resourceValues.get(kind);
      writeText(node, formatNumber(amount, amount < 10 && amount > 0 ? 1 : 0));
      this.resourceRows.get(kind)?.classList.toggle('is-empty', amount <= 0);
    }
  }

  private updateSystems(snapshot: SimulationSnapshot): void {
    const now = performance.now();
    const player = snapshot.player;
    const states: Record<SystemId, boolean> = {
      weapon: (this.systemFlash.weapon ?? 0) > now,
      mining: snapshot.mining.active,
      afterburner: player.boosting,
      shield: player.shield < player.maxShield - 0.5,
      repair: player.health < player.maxHealth - 0.5,
      target: snapshot.targetEnemyId !== null,
      cargo: snapshot.cargo.used > 0,
      scanner: true,
    };
    for (const [id, slot] of this.modules) {
      const active = states[id] && slot.enabled;
      if (active === slot.active) continue;
      slot.active = active;
      slot.button.classList.toggle('is-active', active);
    }
  }

  private updateAlerts(snapshot: SimulationSnapshot, capRatio: number): void {
    const lowCap = capRatio < 0.25 && snapshot.player.alive;
    this.capacitorAlert.classList.toggle('is-visible', lowCap);
    const cargo = snapshot.cargo;
    const full = cargo.capacity > 0 && cargo.used / cargo.capacity >= 0.999;
    this.cargoAlert.classList.toggle('is-visible', full);
  }

  private updateMission(snapshot: SimulationSnapshot): void {
    let objective: string;
    if (this.missionCardState.length > 0) {
      // 4D-fix round 2: an active station mission always wins the headline,
      // even while the tutorial card is still visible (the tutorial has its
      // own card and the tracks below always show every mission).
      objective = this.activeMissionText ?? this.i18n.t('hud.objective.mine');
    } else if (this.tutorialActive) {
      objective = this.i18n.t('hud.objective.training');
    } else if (snapshot.cargo.used <= 0 && snapshot.wave <= 1) {
      objective = this.i18n.t('hud.objective.mine');
    } else {
      objective = this.i18n.t('hud.objective.clearWave', { value: snapshot.wave });
    }
    writeText(this.missionObjective, objective);
    this.renderMissionTracks();
  }

  /** 4D: active station mission shown in the HUD mission card. */
  public setMissionTracker(text: string | null): void {
    this.activeMissionText = text;
    if (this.lastSnapshot) this.updateMission(this.lastSnapshot);
  }

  /** 4D-fix round 2: every active mission as a live track (ready first). */
  public setMissionCards(cards: MissionCard[]): void {
    this.missionCardState = cards;
    const focus = cards.find((card) => card.ready) ?? cards[0] ?? null;
    this.activeMissionText = focus
      ? this.i18n.t(
          focus.ready ? 'mission.trackerReady' : 'mission.tracker',
          { label: focus.label, current: focus.current, amount: focus.amount },
        )
      : null;
    if (this.lastSnapshot) this.updateMission(this.lastSnapshot);
  }

  private renderMissionTracks(): void {
    const host = this.missionTracks;
    host.textContent = '';
    for (const card of this.missionCardState) {
      const row = el('div', 'hud-mission-track' + (card.ready ? ' is-ready' : ''));
      const label = el('span', 'hud-mission-track__label', card.label);
      const bar = el('div', 'mission-progress');
      const fill = el('span');
      const pct = Math.max(0, Math.min(100, (card.current / Math.max(1, card.amount)) * 100));
      fill.style.width = `${pct.toFixed(0)}%`;
      bar.appendChild(fill);
      const count = el('span', 'mission-count');
      count.setAttribute('dir', 'ltr');
      count.textContent = `${Math.floor(card.current)}/${card.amount}`;
      row.append(label, bar, count);
      if (card.ready && this.callbacks.onClaimMission) {
        const claim = createIconButton({
          label: this.i18n.t('mission.claim'),
          title: this.i18n.t('mission.claim'),
          icon: ICONS.credits,
          className: 'hud-mission-track__claim',
        });
        claim.onclick = () => this.callbacks.onClaimMission?.(card.id);
        row.append(claim);
      }
      host.append(row);
    }
    host.hidden = this.missionCardState.length === 0;
  }

  private updateGrace(seconds: number): void {
    const active = seconds > 0.05;
    this.grace.hidden = !active;
    if (active) writeText(this.graceValue, `${Math.ceil(seconds)}s`);
  }

  private updateSpeed(snapshot: SimulationSnapshot): void {
    writeText(this.speedValue, String(Math.round(speedOf(snapshot.player))));
  }

  public flashSystem(id: SystemId): void {
    this.systemFlash[id] = performance.now() + 220;
  }

  private toggleSystem(id: SystemId): void {
    const slot = this.modules.get(id);
    if (!slot) return;
    slot.enabled = !slot.enabled;
    slot.button.classList.toggle('is-off', !slot.enabled);
    slot.button.setAttribute('aria-pressed', String(slot.enabled));
    slot.button.classList.remove('is-cooling');
    void slot.button.offsetWidth;
    slot.button.classList.add('is-cooling');
  }

  private readonly onSystemKey = (event: KeyboardEvent): void => {
    if (!this.visible || document.body.dataset.novaState !== 'playing') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }
    if (!event.code.startsWith('Digit')) return;
    const index = Number(event.code.slice(5)) - 1;
    const system = SYSTEMS[index];
    if (!system) return;
    event.preventDefault();
    this.toggleSystem(system.id);
  };
  public trackTarget(id: number): void {
    if (this.lockedIds.includes(id)) return;
    this.lockedIds.push(id);
    while (this.lockedIds.length > 3) {
      const removed = this.lockedIds.shift();
      if (removed !== undefined) this.removeTargetCard(removed);
    }
  }

  private removeTargetCard(id: number): void {
    const card = this.cards.get(id);
    if (!card) return;
    card.root.remove();
    this.cards.delete(id);
  }

  private removeTarget(id: number): void {
    this.removeTargetCard(id);
    const index = this.lockedIds.indexOf(id);
    if (index >= 0) this.lockedIds.splice(index, 1);
  }

  private createTargetCard(id: number): TargetCardRefs {
    const root = el('div', 'hud-target-card');
    root.appendChild(createIcon(ICONS.target));
    const body = el('div', 'hud-target-card__body');
    const top = el('div', 'hud-target-card__top');
    const name = el('strong', 'hud-target-card__name');
    const distance = el('span', 'hud-target-card__distance');
    top.append(name, distance);
    const bars = el('div', 'hud-target-card__bars');
    const shieldBar = createBar({
      className: 'hud-target-card__bar is-shield',
      fillClassName: 'hud-target-card__fill',
      label: this.i18n.t('hud.shield'),
    });
    const hullBar = createBar({
      className: 'hud-target-card__bar is-hull',
      fillClassName: 'hud-target-card__fill',
      label: this.i18n.t('hud.hull'),
    });
    bars.append(shieldBar.root, hullBar.root);
    body.append(top, bars);
    root.appendChild(body);
    this.targetCards.appendChild(root);
    const refs = { root, name, distance, hullBar, shieldBar };
    this.cards.set(id, refs);
    return refs;
  }

  private updateTargetCards(snapshot: SimulationSnapshot): void {
    if (
      snapshot.targetEnemyId !== null &&
      !this.lockedIds.includes(snapshot.targetEnemyId) &&
      snapshot.enemies.some((enemy) => enemy.id === snapshot.targetEnemyId && enemy.alive)
    ) {
      this.trackTarget(snapshot.targetEnemyId);
    }
    const player = snapshot.player.position;
    for (let index = this.lockedIds.length - 1; index >= 0; index -= 1) {
      const id = this.lockedIds[index];
      const enemy = snapshot.enemies.find((item) => item.id === id && item.alive);
      if (!enemy) {
        this.removeTarget(id);
        continue;
      }
      const card = this.cards.get(id) ?? this.createTargetCard(id);
      writeText(card.name, `${this.i18n.t('hud.raider')} ${id}`);
      writeText(
        card.distance,
        this.i18n.t('hud.range', {
          value: Math.round(
            Math.hypot(
              enemy.position.x - player.x,
              enemy.position.y - player.y,
              enemy.position.z - player.z,
            ),
          ),
        }),
      );
      card.hullBar.set(enemy.maxHealth > 0 ? enemy.health / enemy.maxHealth : 0);
      card.shieldBar.set(enemy.maxShield > 0 ? enemy.shield / enemy.maxShield : 0);
      card.root.classList.toggle('is-selected', snapshot.targetEnemyId === id);
    }
    this.targetCards.hidden = this.lockedIds.length === 0;
  }

  public updateOverview(
    objects: readonly OverviewObject[],
    selected: OverviewObject | null,
  ): void {
    this.selectedObject = selected;
    const seen = new Set<string>();
    for (const object of objects) {
      seen.add(object.key);
      let row = this.rows.get(object.key);
      if (!row) {
        row = this.createOverviewRow(object);
        this.rows.set(object.key, row);
      }
      row.object = object;
      row.root.dataset.kind = object.kind;
      row.dot.style.setProperty('--object-color', object.color);
      writeText(row.name, object.name);
      writeText(row.detail, object.detail);
      writeText(
        row.distance,
        this.i18n.t('hud.range', { value: Math.round(object.distance) }),
      );
      row.root.classList.toggle('is-selected', selected?.key === object.key);
    }
    for (const [key, row] of this.rows) {
      if (seen.has(key)) continue;
      row.root.remove();
      this.rows.delete(key);
    }
    this.applyFilter();
    this.renderSelected();
  }

  public setSelectedObject(object: OverviewObject | null): void {
    this.selectedObject = object;
    this.renderSelected(true);
  }

  private createOverviewRow(object: OverviewObject): OverviewRowRefs {
    const root = el('button', 'hud-object');
    root.type = 'button';
    const dot = el('span', 'hud-object__dot');
    const body = el('span', 'hud-object__body');
    const name = el('strong', 'hud-object__name');
    const detail = el('span', 'hud-object__detail');
    body.append(name, detail);
    const distance = el('span', 'hud-object__distance');
    root.append(dot, body, distance);
    const row: OverviewRowRefs = { root, name, detail, distance, dot, object };
    root.addEventListener('click', () => {
      this.selectedObject = row.object;
      this.renderSelected(true);
      this.callbacks.onSelectObject(row.object);
    });
    this.overviewList.appendChild(root);
    return row;
  }

  private setFilter(filter: OverviewFilter): void {
    this.filter = filter;
    this.applyFilter();
  }

  private applyFilter(): void {
    let visible = 0;
    for (const row of this.rows.values()) {
      const show = this.filter === 'all' || row.object.kind === this.filter;
      row.root.hidden = !show;
      if (show) visible += 1;
    }
    this.overviewEmpty.hidden = visible > 0;
  }

  private renderSelected(force = false): void {
    const object = this.selectedObject;
    if (!object) {
      this.selectedPanel.classList.add('is-empty');
      if (force || this.selectedKey !== '') {
        this.selectedKey = '';
        this.selectedKindCache = null;
        this.selectedActions.replaceChildren();
      }
      return;
    }
    this.selectedPanel.classList.remove('is-empty');
    writeText(this.selectedName, object.name);
    writeText(this.selectedKind, this.i18n.t(KIND_LABELS[object.kind]));
    writeText(this.selectedDistance, this.i18n.t('hud.range', { value: Math.round(object.distance) }));
    writeText(this.selectedDetail, object.detail);
    const hasRatio = typeof object.ratio === 'number';
    this.selectedBar.root.hidden = !hasRatio;
    if (hasRatio) {
      this.selectedBar.set(object.ratio as number, object.name);
    }
    if (force || this.selectedKey !== object.key || this.selectedKindCache !== object.kind) {
      this.selectedKey = object.key;
      this.selectedKindCache = object.kind;
      this.selectedActions.replaceChildren();
      for (const action of KIND_ACTIONS[object.kind]) {
        const label = this.i18n.t(ACTION_KEYS[action]);
        const button = createButton({
          label,
          text: label,
          icon: ACTION_ICONS[action],
          className: 'hud-selected__action',
          size: 'sm',
          variant: 'ghost',
          onClick: () => {
            if (this.selectedObject) this.callbacks.onObjectAction(action, this.selectedObject);
          },
        });
        this.selectedActions.appendChild(button);
      }
    }
  }
  public updateTarget(target: TargetIndicator | null): void {
    this.lastTarget = target;
    if (!target) {
      this.targetLock.hidden = true;
      this.targetMarker.hidden = true;
      this.targetName.textContent = this.i18n.t('hud.noTarget');
      this.targetRange.textContent = this.i18n.t('hud.waiting');
      this.root.classList.remove('is-locked');
      return;
    }
    this.targetLock.hidden = !target.point.visible;
    this.targetName.textContent = target.label;
    this.targetRange.textContent = this.i18n.t('hud.range', {
      value: Math.round(target.distance),
    });
    this.root.classList.add('is-locked');
    this.targetMarker.hidden = !target.point.visible;
    this.targetMarker.style.left = `${target.point.x}px`;
    this.targetMarker.style.top = `${target.point.y}px`;
    this.targetMarker.style.setProperty('--target-color', target.color);
    this.targetMarkerLabel.textContent = target.label;
    this.targetMarkerDistance.textContent = this.i18n.t('hud.range', {
      value: Math.round(target.distance),
    });
  }

  public updateCombatTarget(target: CombatTargetIndicator | null): void {
    if (!target || !target.lead || !target.lead.visible) {
      this.leadIndicator.hidden = true;
      return;
    }
    this.leadIndicator.hidden = false;
    this.leadIndicator.style.left = `${target.lead.x}px`;
    this.leadIndicator.style.top = `${target.lead.y}px`;
  }

  public toast(message: string, tone: 'info' | 'warn' | 'good' = 'info'): void {
    const toast = el('div', `toast toast--${tone}`, message);
    this.toasts.appendChild(toast);
    while (this.toasts.children.length > 3) {
      this.toasts.removeChild(this.toasts.firstElementChild as Element);
    }
    window.requestAnimationFrame(() => toast.classList.add('is-visible'));
    const timer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 260);
      const index = this.toastTimers.indexOf(timer);
      if (index >= 0) this.toastTimers.splice(index, 1);
    }, 2300);
    this.toastTimers.push(timer);
  }

  public clearToasts(): void {
    for (const timer of this.toastTimers) window.clearTimeout(timer);
    this.toastTimers.length = 0;
    while (this.toasts.firstChild) this.toasts.removeChild(this.toasts.firstChild);
  }

  public flashDamage(directionDegrees = 0): void {
    this.root.classList.remove('is-hit');
    this.damageArc.classList.remove('is-active');
    this.damageArc.style.setProperty('--damage-angle', `${directionDegrees}deg`);
    void this.root.offsetWidth;
    this.root.classList.add('is-hit');
    this.damageArc.classList.add('is-active');
    window.clearTimeout(this.damageTimer);
    this.damageTimer = window.setTimeout(() => {
      this.root.classList.remove('is-hit');
      this.damageArc.classList.remove('is-active');
    }, 720);

    this.incomingAlert.classList.add('is-visible');
    this.incomingAlert.style.setProperty('--alert-angle', `${directionDegrees}deg`);
    window.clearTimeout(this.incomingTimer);
    this.incomingTimer = window.setTimeout(() => {
      this.incomingAlert.classList.remove('is-visible');
    }, 1500);
  }

  public updateEnemyMarkers(markers: readonly EnemyMarker[]): void {
    const seen = new Set<number>();
    for (const marker of markers) {
      seen.add(marker.id);
      let node = this.markers.get(marker.id);
      if (!node) {
        const root = el('div', 'enemy-marker');
        const arrow = el('span', 'enemy-marker__arrow');
        const text = el('span', 'enemy-marker__text');
        const label = el('strong', 'enemy-marker__label');
        const distance = el('span', 'enemy-marker__distance');
        text.append(label, distance);
        root.append(arrow, text);
        this.markerLayer.appendChild(root);
        node = { root, label, distance, arrow };
        this.markers.set(marker.id, node);
      }
      node.root.style.left = `${marker.x}px`;
      node.root.style.top = `${marker.y}px`;
      node.root.classList.toggle('is-edge', marker.edge);
      node.root.classList.toggle('is-locked', marker.locked);
      node.label.textContent = this.i18n.t('hud.raider');
      node.distance.textContent = `${Math.round(marker.distance)} m`;
      node.arrow.style.transform = `rotate(${marker.angle}rad)`;
    }
    for (const [id, node] of this.markers) {
      if (seen.has(id)) continue;
      node.root.remove();
      this.markers.delete(id);
    }
  }

  private clearEnemyMarkers(): void {
    for (const node of this.markers.values()) node.root.remove();
    this.markers.clear();
  }

  public updateTutorial(state: TutorialState): void {
    const done = [state.hitEnemy, state.minedOre];
    const visible = state.visible && !(state.hitEnemy && state.minedOre);
    this.tutorialActive = visible;
    this.tutorial.hidden = !visible;
    this.tutorialSteps.forEach((step, index) => {
      step.classList.toggle('is-done', done[index]);
      const marker = step.querySelector<HTMLElement>('.tutorial__index');
      if (marker) marker.textContent = done[index] ? '✓' : String(index + 1);
    });
    if (this.lastSnapshot) this.updateMission(this.lastSnapshot);
  }
  private drawRadar(snapshot: SimulationSnapshot): void {
    const context = this.radarContext;
    if (!context) return;
    const logical = 144;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixels = Math.round(logical * dpr);
    if (this.radar.width !== pixels) {
      this.radar.width = pixels;
      this.radar.height = pixels;
    }
    context.setTransform(pixels / logical, 0, 0, pixels / logical, 0, 0);
    context.clearRect(0, 0, logical, logical);

    const center = logical / 2;
    const radius = logical / 2 - 6;
    const range = 1200;

    context.save();
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fillStyle = 'rgba(2, 12, 20, 0.72)';
    context.fill();
    context.strokeStyle = 'rgba(113, 204, 238, 0.35)';
    context.lineWidth = 1;
    context.stroke();

    context.strokeStyle = 'rgba(113, 204, 238, 0.13)';
    for (const fraction of [0.33, 0.66]) {
      context.beginPath();
      context.arc(center, center, radius * fraction, 0, Math.PI * 2);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(center - radius, center);
    context.lineTo(center + radius, center);
    context.moveTo(center, center - radius);
    context.lineTo(center, center + radius);
    context.stroke();

    const forward = forwardOf(snapshot.player.quaternion);
    let fx = forward.x;
    let fz = forward.z;
    const flat = Math.hypot(fx, fz);
    if (flat < 0.001) {
      fx = 0;
      fz = -1;
    } else {
      fx /= flat;
      fz /= flat;
    }
    const rightX = -fz;
    const rightZ = fx;
    const player = snapshot.player.position;

    const project = (x: number, z: number): { x: number; y: number } | null => {
      const dx = x - player.x;
      const dz = z - player.z;
      const ahead = dx * fx + dz * fz;
      const side = dx * rightX + dz * rightZ;
      if (Math.hypot(dx, dz) > range) return null;
      return {
        x: center + (side / range) * radius,
        y: center - (ahead / range) * radius,
      };
    };

    for (const asteroid of snapshot.asteroids) {
      if (!asteroid.alive) continue;
      const point = project(asteroid.position.x, asteroid.position.z);
      if (!point) continue;
      context.beginPath();
      context.arc(point.x, point.y, 1.2, 0, Math.PI * 2);
      context.fillStyle = RESOURCES[asteroid.resource].cssColor;
      context.globalAlpha = 0.55;
      context.fill();
    }
    context.globalAlpha = 1;

    for (const enemy of snapshot.enemies) {
      if (!enemy.alive) continue;
      const point = project(enemy.position.x, enemy.position.z);
      if (!point) continue;
      const locked = enemy.id === snapshot.targetEnemyId;
      context.beginPath();
      context.arc(point.x, point.y, locked ? 3.4 : 2.5, 0, Math.PI * 2);
      context.fillStyle = locked ? '#ffd5da' : '#ff5e68';
      context.fill();
      if (locked) {
        context.beginPath();
        context.arc(point.x, point.y, 5.4, 0, Math.PI * 2);
        context.strokeStyle = 'rgba(255, 158, 168, 0.8)';
        context.lineWidth = 1;
        context.stroke();
      }
    }

    context.beginPath();
    context.moveTo(center, center - 5);
    context.lineTo(center + 4, center + 4);
    context.lineTo(center, center + 2);
    context.lineTo(center - 4, center + 4);
    context.closePath();
    context.fillStyle = '#9cefff';
    context.fill();
    context.restore();

    writeText(this.radarRange, `${(range / 1000).toFixed(1)} km`);
  }

  public updateDebug(stats: RenderStats, snapshot: SimulationSnapshot): void {
    if (this.fpsBadgeValue) writeText(this.fpsBadgeValue, String(Math.round(stats.fps)));
    if (!this.debugVisible) return;
    const set = (key: string, value: string): void => {
      const node = this.debugValues.get(key);
      if (node) node.textContent = value;
    };
    const player = snapshot.player;
    set('fps', String(Math.round(stats.fps)));
    set('quality', stats.quality.toUpperCase());
    set('calls', String(stats.drawCalls));
    set('tris', formatNumber(stats.triangles));
    set('particles', String(stats.particles));
    set('pixel', stats.pixelRatio.toFixed(2));
    set('enemies', String(snapshot.enemies.filter((enemy) => enemy.alive).length));
    set('asteroids', String(snapshot.asteroids.filter((asteroid) => asteroid.alive).length));
    set(
      'position',
      `${player.position.x.toFixed(0)} / ${player.position.y.toFixed(0)} / ${player.position.z.toFixed(0)}`,
    );
  }
}

