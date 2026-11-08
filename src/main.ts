import './ui/kit/kit.css';
import './style.css';
import './theme.css';
import './menu.css';
import './hud.css';
import './fitting.css';
import { PLAYER_SHIPS, RESOURCES, RESOURCE_ORDER, type ShipDefinition } from './assets-config';
import { HOME_STATION_ID, ZONES } from './game/worldData';
import {
  MISSION_EVENT_RULES,
  MISSION_MAX_ACTIVE,
  STATION_STORAGE_CAPACITY,
  type Difficulty,
  type UserSettings,
} from './game/config';
import { GameSimulation } from './game/GameSimulation';
import { forwardOf, rightOf, vec3Dot, vec3Normalize, vec3Sub } from './game/math';
import { createEmptyInput, type GameEvent, type PlayerLoadout, type ResourceKind, type ColonyBuildingType } from './game/types';
import { MODULE_DEFINITIONS, normalizeOwnedModules, getModuleSellPrice, applyModulesToLoadout, getModuleById, restoreFittedModules } from './game/fitting';
import { refreshMarketPrices, getRecipe, createRefineryJob, getRepairCost, refineJobRemaining, type MarketPriceTable } from './game/economy';
import {
  applyMissionEvent,
  completedMissions,
  generateMissionBoard,
  isKnownZone,
  missionIsReady,
  missionLabel,
  MISSION_BOARD_REFRESH_MS,
  type MissionGameEvent,
  type MissionOffer,
  type MissionTextContext,
} from './game/missions';
import {
  acceptOfferAction,
  abandonAction,
  claimAction,
  deliverMissionsAction,
  normalizeMissionRecord,
} from './game/missionFlow';
import type { ColonyPlotState, PilotProfile } from './ui/ProfileStore';
import { AudioManager } from './audio/AudioManager';
import { GameRenderer } from './render/GameRenderer';
import { qualityLabelKeys, type QualityMode } from './render/QualityManager';
import { el, formatNumber } from './ui/dom';
import { Haptics } from './ui/haptics';
import { Hud, type EnemyMarker, type ObjectAction, type OverviewObject } from './ui/Hud';
import { I18n } from './ui/i18n';
import { InputController } from './ui/InputController';
import { Menu } from './ui/Menu';
import { GameOverOverlay, PauseOverlay, type GameOverStats } from './ui/Overlays';
import { SettingsStore } from './ui/SettingsStore';
import { ProfileStore } from './ui/ProfileStore';
import { TouchControls } from './ui/TouchControls';
import { SystemMap } from './ui/SystemMap';
import { MarketPanel } from './ui/MarketPanel';
import { ColonyPanel } from './ui/ColonyPanel';
import { ResourceCodex } from './ui/ResourceCodex';
import { SOLAR_SYSTEM } from './game/solarSystem';

type AppState = 'loading' | 'menu' | 'playing' | 'paused' | 'dying' | 'gameover';

const HUD_INTERVAL = 0.05;
const DEBUG_INTERVAL = 0.25;

class NovaFleetApp {
  private readonly i18n = new I18n();
  private readonly audio = new AudioManager();
  private readonly haptics = new Haptics();
  private readonly touchCapable: boolean;
  private readonly renderer: GameRenderer;
  private readonly menu: Menu;
  private readonly hud: Hud;
  private readonly pause: PauseOverlay;
  private readonly gameOver: GameOverOverlay;
  private readonly input: InputController;
  private readonly touch: TouchControls;
  private readonly settingsStore: SettingsStore;
  private readonly profileStorage = new ProfileStore();
  private readonly systemMap: SystemMap;
  private readonly market: MarketPanel;
  private readonly colony: ColonyPanel;
  private readonly codex: ResourceCodex;

  private state: AppState = 'loading';
  private settings: UserSettings;
  private selectedShip: ShipDefinition = PLAYER_SHIPS[0];
  private simulation: GameSimulation | null = null;
  private fleetReady = false;
  private raf = 0;
  private lastTime = 0;
  private hudTimer = 0;
  private debugTimer = 0;
  private overviewTimer = 0;
  private selectedOverviewKey: string | null = null;
  private gameOverTimer = -1;
  private oreToastTimer = 0;
  private oreSoundTimer = 0;
  private lastOreToast = -10;
  private lastOreSound = -10;
  private lastWave = 1;
  private tutorialSkipped = false;
  private tutorialHitEnemy = false;
  private tutorialMinedOre = false;
  private disposed = false;
  /** ?debug=1 only: mission event log overlay + test handle. */
  private debugEnabled = false;
  private debugEvents: string[] = [];
  private debugOverlay: HTMLElement | null = null;
  private currentZoneId = 'nova-prime';

  /**
   * Zone used by station services: the hangar destination while in the menu
   * (currentZoneId is stale there), the live flight zone otherwise.
   */
  private activeZoneId(profile?: PilotProfile | null): string {
    if (this.state === 'menu' || this.state === 'loading') {
      const start = profile?.startingZone;
      return start && isKnownZone(start) ? start : 'nova-prime';
    }
    return this.currentZoneId || profile?.startingZone || 'nova-prime';
  }
  private warping = false;

  private readonly onVisibility = (): void => {
    if (document.hidden && this.state === 'playing') this.pauseGame();
  };

  private readonly onBeforeUnload = (): void => this.dispose();

  constructor() {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const uiRoot = document.querySelector<HTMLElement>('#ui-root');
    if (!canvas || !uiRoot) throw new Error('Nova Fleet markup is missing.');

    // 4D-fix round 2: ?debug=1 mission debug overlay (last 5 mission events +
    // active missions with live progress) and a window handle for testing.
    this.debugEnabled =
      typeof window !== 'undefined' &&
      window.location.search.toLowerCase().includes('debug=1');
    if (this.debugEnabled) this.setupMissionDebug();

    this.touchCapable = window.matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch-capable', this.touchCapable);
    this.settingsStore = new SettingsStore(this.touchCapable);
    this.settings = this.settingsStore.settings;

    this.menu = new Menu(uiRoot, this.i18n, {
      onSelectShip: (id) => this.selectShip(id),
      onSelectDifficulty: (difficulty) => this.changeDifficulty(difficulty),
      onLaunch: () => this.startRun(),
      onToggleLanguage: () => this.toggleLanguage(),
      onToggleSound: () => this.toggleSound(),
      onToggleHaptics: () => this.toggleHaptics(),
      onToggleFps: () => this.toggleFps(),
      onProfileChange: () => this.updatePilotName(),
      onOpenMap: () => this.toggleMap(),
      onOpenMarket: () => this.openMarket(),
      onOpenColony: () => this.openColony(),
      onOpenCodex: () => this.openCodex(),
      onFitApplied: (shipId, loadout) => this.saveFit(shipId, loadout),
      onSellModule: (moduleId, qty) => this.sellModule(moduleId, qty),
    });
    this.hud = new Hud(uiRoot, this.i18n, {
      onPause: () => this.togglePause(),
      onMap: () => this.toggleMap(),
      onColony: () => this.openFlightPanel('colony'),
      onMarket: () => this.openFlightPanel('market'),
      onCodex: () => this.openCodex(),
      onSkipTutorial: () => this.skipTutorial(),
      onClaimMission: (missionId) => this.claimMission(missionId),
      onSelectObject: (object) => this.selectOverviewObject(object),
      onObjectAction: (action, object) => this.handleObjectAction(action, object),
      onThrottle: (value) => this.input.setThrottle(value),
    });
    this.pause = new PauseOverlay(uiRoot, this.i18n, {
      onResume: () => this.resumeGame(),
      onHangar: () => this.returnToHangar(),
      onQuality: (mode) => this.setQualityMode(mode),
      onToggleSound: () => this.toggleSound(),
      onToggleHaptics: () => this.toggleHaptics(),
      onDifficulty: (difficulty) => this.changeDifficulty(difficulty),
      onSpeedScale: (value) => this.changeSettings({ speedScale: value }),
      onSensitivity: (value) => this.changeSettings({ sensitivity: value }),
      onHudScale: (value) => this.changeSettings({ hudScale: value }),
      onHudOpacity: (value) => this.changeSettings({ hudOpacity: value }),
      onToggleAimAssist: () => this.changeSettings({ aimAssist: !this.settings.aimAssist }),
      onToggleAssistedFlight: () =>
        this.changeSettings({ assistedFlight: !this.settings.assistedFlight }),
    });
    this.gameOver = new GameOverOverlay(uiRoot, this.i18n, {
      onRelaunch: () => this.startRun(),
      onHangar: () => this.returnToHangar(),
    });
    this.systemMap = new SystemMap(uiRoot, this.i18n, {
      onWarp: (targetId) => void this.warpToTarget(targetId),
      onSetDestination: (targetId) => this.setStartingZone(targetId),
      onLaunch: () => {
        this.systemMap.setVisible(false);
        this.startRun();
      },
      onClose: () => {
        if (this.state === 'playing') this.input.setEnabled(true);
      },
    });
    this.market = new MarketPanel(uiRoot, this.i18n, {
      onBuyModule: (moduleId, qty) => {
        const profile = this.profileStorage.getActive();
        if (!profile) return;
        const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
        if (!mod) return;
        const q = Math.max(1, Math.floor(qty || 1));
        const total = mod.creditCost * q;
        if (profile.credits < total) return;
        const ownedModules = normalizeOwnedModules(profile.ownedModules);
        ownedModules[moduleId] = (ownedModules[moduleId] ?? 0) + q;
        this.profileStorage.updateActive({ credits: profile.credits - total, ownedModules });
        this.hud.setCredits(profile.credits - total);
        this.refreshPanelState();
        this.audio.playUi();
      },
      onSellModule: (moduleId, qty) => this.sellModule(moduleId, qty),
      onSellResource: (kind, qty) => {
        const profile = this.profileStorage.getActive();
        if (!profile) return;
        const price = this.getMarketPrice(kind, 'sell');
        const storage = { ...(profile.stationStorage ?? {}) } as Record<ResourceKind, number>;
        const cargoHave = this.simulation && this.state === 'paused'
          ? Math.floor(this.simulation.cargo.resources[kind] ?? 0)
          : 0;
        const storeHave = Math.floor(storage[kind] ?? 0);
        const q = Math.max(0, Math.min(qty, cargoHave + storeHave));
        if (q <= 0) return;
        const takeCargo = Math.min(q, cargoHave);
        const takeStorage = q - takeCargo;
        if (this.simulation && takeCargo > 0) {
          this.simulation.cargo.resources[kind] = cargoHave - takeCargo;
          this.simulation.cargo.used = Math.max(0, this.simulation.cargo.used - takeCargo);
        }
        if (takeStorage > 0) storage[kind] = storeHave - takeStorage;
        const val = price * q;
        this.profileStorage.updateActive({ stationStorage: storage, credits: profile.credits + val });
        this.hud.setCredits(profile.credits + val);
        this.hud.creditToast(val);
        this.refreshPanelState();
      },
      onBuyResource: (kind, qty) => {
        const profile = this.profileStorage.getActive();
        if (!profile) return;
        const price = this.getMarketPrice(kind, 'buy');
        const maxByCredits = Math.floor(profile.credits / Math.max(1, price));
        // If in-flight (paused via market), buy into cargo when space allows; else station storage.
        if (this.simulation && this.state === 'paused') {
          const space = Math.max(0, Math.floor(this.simulation.cargo.capacity - this.simulation.cargo.used));
          const q = Math.max(0, Math.min(qty, maxByCredits, space));
          if (q <= 0) return;
          const cost = q * price;
          this.simulation.cargo.resources[kind] = Math.floor(this.simulation.cargo.resources[kind] ?? 0) + q;
          this.simulation.cargo.used += q;
          this.profileStorage.updateActive({ credits: profile.credits - cost });
          this.hud.setCredits(profile.credits - cost);
          this.refreshPanelState();
          return;
        }
        const q = Math.max(1, Math.min(qty, maxByCredits));
        const cost = q * price;
        if (profile.credits < cost) return;
        const storage = { ...(profile.stationStorage ?? {}) } as Record<ResourceKind, number>;
        const used = Object.values(storage).reduce((a, b) => a + (b ?? 0), 0);
        const space = Math.max(0, STATION_STORAGE_CAPACITY - used);
        if (space < q) return;
        storage[kind] = Math.floor(storage[kind] ?? 0) + q;
        this.profileStorage.updateActive({ stationStorage: storage, credits: profile.credits - cost });
        this.hud.setCredits(profile.credits - cost);
        this.refreshPanelState();
      },
      onTransfer: (kind, qty, direction) => this.transferResource(kind, qty, direction),
      onRefine: (recipeId, batches) => this.startRefine(recipeId, batches),
      onCollectRefine: (jobId) => this.collectRefine(jobId),
      onRepair: () => this.repairShip(),
      onAcceptMission: (missionId) => this.acceptMission(missionId),
      onAbandonMission: (missionId) => this.abandonMission(missionId),
      onClaimMission: (missionId) => this.claimMission(missionId),
    });
    this.colony = new ColonyPanel(uiRoot, this.i18n, {
      onPlaceBuilding: (plotId, building) => {
        const profile = this.profileStorage.getActive();
        if (!profile) return;
        const basePlots: ColonyPlotState[] = (profile.colonyPlots ?? Array.from({ length: 6 }, (_, i) => ({ id: i, level: 0 }))).map(p => ({ ...p }));
        const idx = basePlots.findIndex(p => p.id === plotId);
        if (idx < 0 || basePlots[idx].building) return;
        const COSTS: Record<string, { ferrite: number; alloys: number; credits: number }> = {
          command: { ferrite: 100, alloys: 10, credits: 0 }, extractor: { ferrite: 80, alloys: 5, credits: 500 },
          shipyard: { ferrite: 150, alloys: 25, credits: 2000 }, rnd: { ferrite: 60, alloys: 20, credits: 1500 },
          barracks: { ferrite: 90, alloys: 8, credits: 800 }, refinery: { ferrite: 120, alloys: 15, credits: 1200 },
        };
        const cost = COSTS[building] ?? { ferrite: 0, alloys: 0, credits: 0 };
        const storage = { ...(profile.stationStorage ?? {}) } as Record<ResourceKind, number>;
        const ferr = storage['ferrite'] ?? 0;
        const alloy = storage['alloys'] ?? 0;
        if (ferr < cost.ferrite || alloy < cost.alloys || profile.credits < cost.credits) return;
        storage['ferrite'] = ferr - cost.ferrite;
        storage['alloys'] = alloy - cost.alloys;
        basePlots[idx] = { ...basePlots[idx], building: building as ColonyBuildingType, level: 1 };
        this.profileStorage.updateActive({ colonyPlots: basePlots, stationStorage: storage, credits: profile.credits - cost.credits });
        this.hud.setCredits(profile.credits - cost.credits);
        this.refreshPanelState();
      },
    });
    this.codex = new ResourceCodex(uiRoot, this.i18n, {
      getDiscovered: () => this.profileStorage.getActive()?.discoveredResources ?? [],
      onClose: () => {
        if (this.state === 'playing') this.input.setEnabled(true);
      },
    });

    this.renderer = new GameRenderer(canvas);
    this.input = new InputController(canvas, {
      onPause: () => this.togglePause(),
      onDebug: () => this.hud.toggleDebug(),
      onToggleAudio: () => this.toggleSound(),
      onInteract: () => void this.audio.unlock(),
      onCycleTarget: () => this.cycleTarget(),
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyC' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      this.toggleMap();
    });
    this.touch = new TouchControls(this.hud.touchLayer, this.input, this.i18n, this.haptics);

    this.menu.setTouchCapable(this.touchCapable);
    this.menu.setDifficulty(this.settings.difficulty);
    this.pause.setTouchCapable(this.touchCapable);
    this.pause.setSettings(this.settings);
    this.input.setSensitivity(this.settings.sensitivity);
    this.menu.setSoundEnabled(this.audio.enabled);
    this.menu.setHapticsEnabled(this.haptics.enabled);
    this.menu.setFpsEnabled(this.settings.showFps);
    this.pause.setSoundEnabled(this.audio.enabled);
    this.pause.setHapticsEnabled(this.haptics.enabled);
    this.hud.setAudioEnabled(this.audio.enabled);
    this.hud.setFpsVisible(this.settings.showFps);
    this.pause.setQualityMode(this.renderer.quality.mode);

    this.renderer.quality.onChange((settings, automatic) => {
      this.pause.setQualityMode(this.renderer.quality.mode);
      if (automatic && (this.state === 'playing' || this.state === 'paused')) {
        this.hud.toast(
          this.i18n.t('toast.quality', {
            value: this.i18n.t(qualityLabelKeys[settings.level]),
          }),
          'info',
        );
      }
    });

    this.i18n.onChange(() => this.refreshLanguage());
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    this.refreshLanguage();
    this.restoreSavedFits();
    this.updatePilotName();
    this.setState('loading');
  }

  /**
   * 4D: re-apply the saved per-hull fittings into the hangar loadouts. Without
   * this, a reload leaves fitted copies reserved in the profile but missing
   * from the ship, so the player flies an empty hull and cannot sell them.
   */
  private restoreSavedFits(): void {
    const fitted = this.profileStorage.getActive()?.fittedModules;
    if (!fitted) return;
    for (const ship of PLAYER_SHIPS) {
      const saved = fitted[ship.id];
      if (!saved) continue;
      ship.loadout.modules = restoreFittedModules(ship.loadout, saved);
    }
  }

  private updatePilotName(): void {
    const bar = document.getElementById('pilot-name-bar');
    if (!bar) return;
    const active = this.profileStorage.getActive();
    this.restoreSavedFits();
    this.hud.setPilotName(active?.name ?? null);
    if (active?.name) {
      bar.textContent = `${this.i18n.t('profile.active')}: ${active.name}`;
      bar.classList.add('is-visible');
      bar.setAttribute('title', active.name);
    } else {
      bar.textContent = '';
      bar.classList.remove('is-visible');
      bar.removeAttribute('title');
    }
  }

  private setStartingZone(zoneId: string): void {
    this.profileStorage.updateActive({ startingZone: zoneId });
    this.audio.playUi();
  }

  private getZonePosition(zoneId: string): { x: number; y: number; z: number } {
    const planet = SOLAR_SYSTEM.planets.find((p) => p.id === zoneId);
    if (planet) {
      const angle = planet.orbitIndex * 1.15 + 0.6;
      const distance = planet.orbitRadius * 0.94;
      return { x: Math.cos(angle) * distance, y: 160, z: Math.sin(angle) * distance };
    }
    // zones behind gate / special zones
    if (zoneId === 'debris-field') return { x: 7600, y: 180, z: -4200 };
    if (zoneId === 'nebula-pocket') return { x: 8800, y: 220, z: -5200 };
    if (zoneId === 'nova-prime') return { x: 0, y: 120, z: 0 };
    return { x: 0, y: 160, z: 0 };
  }

  /** Toggles the star map and parks flight input while it is open. */
  private toggleMap(): void {
    const next = !this.systemMap.isVisible;
    if (next) {
      this.input.reset();
      this.input.setEnabled(false);
      this.audio.playUi();
      const inMenu = this.state === 'menu' || this.state === 'loading';
      const profile = this.profileStorage.getActive();
      const inCombat = !!this.simulation && this.simulation.enemies.some((e) => e.alive);
      this.systemMap.setState({
        mode: inMenu ? 'menu' : 'flight',
        startingZoneId: profile?.startingZone ?? 'nova-prime',
        currentZoneId: this.currentZoneId,
        inCombat,
        launchReady: this.fleetReady,
      });
    }
    this.systemMap.setVisible(next);
  }

  private async warpToTarget(targetId: string): Promise<void> {
    const simulation = this.simulation;
    if (!simulation || this.state !== 'playing' || this.warping) return;
    if (targetId === this.currentZoneId) {
      this.hud.toast(this.i18n.t('map.alreadyHere'), 'info');
      return;
    }
    if (simulation.enemies.some((e) => e.alive)) {
      this.hud.toast(this.i18n.t('map.warpDisabledCombat'), 'warn');
      return;
    }
    this.warping = true;
    this.systemMap.setVisible(false);
    this.input.reset();
    this.input.setEnabled(false);
    this.audio.playWarpIn();
    this.haptics.pulse([12, 24, 12]);
    // Tunnel/loading transition (2.5s)
    const overlay = el('div', 'warp-transition');
    overlay.innerHTML = `<div class="warp-transition__tunnel"></div><div class="warp-transition__label">${this.i18n.t('map.warping')}</div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-active'));
    await new Promise<void>((r) => window.setTimeout(r, 2500));
    const pos = this.getZonePosition(targetId);
    simulation.teleportPlayer(pos);
    simulation.setZone(targetId);
    this.currentZoneId = targetId;
    this.renderer.setZone(targetId);
    this.renderer.snapCamera(simulation);
    const visited = new Set(this.profileStorage.getActive()?.visitedZones ?? ['nova-prime']);
    visited.add(targetId);
    // Keep the launch destination in sync with the zone the ship is actually in,
    // otherwise a relaunch would fly in a different zone than the mission board.
    this.profileStorage.updateActive({ visitedZones: Array.from(visited), startingZone: targetId });
    overlay.classList.remove('is-active');
    window.setTimeout(() => overlay.remove(), 350);
    this.warping = false;
    if (this.state === 'playing') this.input.setEnabled(true);
    this.hud.toast(this.i18n.t('map.warping'), 'good');
  }

  /** Legacy alias used by overview actions. */
  private warpToPlanet(planetId: string): void {
    void this.warpToTarget(planetId);
  }

  public async start(): Promise<void> {
    this.updatePilotName();
    this.menu.setShips(PLAYER_SHIPS);
    this.selectedShip = this.menu.selected ?? PLAYER_SHIPS[0];
    this.menu.setLoading(0, 0, PLAYER_SHIPS.length + 1);
    this.menu.show();
    this.hud.setVisible(false);
    this.touch.setVisible(false);
    this.renderer.showHangar(this.selectedShip);

    this.lastTime = performance.now();
    this.raf = window.requestAnimationFrame(this.loop);

    const unlock = (): void => {
      void this.audio.unlock();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    try {
      await this.renderer.loadFleet((progress) => {
        this.menu.setLoading(progress.fraction, progress.loaded, progress.total);
      });
    } catch (error) {
      console.warn('[Nova Fleet] Fleet preload reported an unexpected error.', error);
    }

    this.fleetReady = true;
    this.menu.setReady(true);
    this.renderer.showHangar(this.selectedShip);
    this.menu.show();
    this.audio.setScene('hangar');
    this.setState('menu');
    this.lastTime = performance.now();
  }

  private readonly loop = (now: number): void => {
    if (this.disposed) return;
    this.raf = window.requestAnimationFrame(this.loop);
    const dt =
      this.lastTime === 0 ? 0 : Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (this.state === 'loading' || this.state === 'menu') {
      this.renderer.updateHangar(dt);
      this.renderer.render();
      return;
    }

    if (this.state === 'playing' || this.state === 'dying') {
      this.tickGame(dt);
      return;
    }

    // Paused and post-run screens are static; the overlay renders above the
    // last presented frame instead of burning GPU time at 60fps.
    if (this.state === 'paused' || this.state === 'gameover') {
      this.lastTime = now;
    }
  };

  private tickGame(dt: number): void {
    const simulation = this.simulation;
    if (!simulation) return;

    const input = this.state === 'playing' ? this.input.getInput() : createEmptyInput();
    simulation.update(dt, input);
    const events = simulation.drainEvents();
    if (events.length > 0) this.handleEvents(events);

    this.renderer.updateGame(dt, simulation);
    this.renderer.render();
    this.updateHud(dt, simulation);

    const player = simulation.player;
    const speedRatio =
      Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z) /
      Math.max(player.baseSpeed, 1);
    this.audio.updateEngine(speedRatio, player.boosting, player.alive);
    this.audio.setMining(simulation.mining.active);

    if (this.state === 'dying') {
      this.gameOverTimer -= dt;
      if (this.gameOverTimer <= 0) this.finishRun();
    }
  }

  private updateHud(dt: number, simulation: GameSimulation): void {
    this.hudTimer += dt;
    this.debugTimer += dt;
    this.overviewTimer += dt;
    this.oreToastTimer += dt;
    this.oreSoundTimer += dt;

    const snapshot = simulation.getSnapshot();
    if (this.hudTimer >= HUD_INTERVAL) {
      this.hudTimer = 0;
      this.hud.update(snapshot);
      this.hud.setCredits(this.profileStorage.getActive()?.credits ?? 0);
    }
    if (this.overviewTimer >= 0.25) {
      this.overviewTimer = 0;
      this.updateOverview(simulation);
    }
    if (this.debugTimer >= DEBUG_INTERVAL) {
      this.debugTimer = 0;
      this.hud.updateDebug(this.renderer.getStats(), snapshot);
      this.updateMissionDebug();
    }

    const target = simulation.getMiningTarget();
    if (target) {
      const point = this.renderer.projectWorldToScreen(target.position);
      const distance = Math.hypot(
        target.position.x - snapshot.player.position.x,
        target.position.y - snapshot.player.position.y,
        target.position.z - snapshot.player.position.z,
      );
      this.hud.updateTarget({
        label: this.i18n.resourceLabel(target.resource),
        color: RESOURCES[target.resource].cssColor,
        distance: Math.max(0, distance - target.radius),
        point,
      });
    } else {
      this.hud.updateTarget(null);
    }

    this.updateEnemyMarkers(simulation);
    const solution = simulation.getTargetSolution();
    if (solution) {
      this.hud.updateCombatTarget({
        label: this.i18n.t('hud.raider'),
        distance: solution.distance,
        lead: this.renderer.projectWorldToScreen(solution.lead),
      });
    } else {
      this.hud.updateCombatTarget(null);
    }

    this.hud.updateTutorial({
      visible:
        !this.tutorialSkipped && !(this.tutorialHitEnemy && this.tutorialMinedOre),
      hitEnemy: this.tutorialHitEnemy,
      minedOre: this.tutorialMinedOre,
    });

    if (snapshot.wave > this.lastWave) {
      this.lastWave = snapshot.wave;
      this.hud.toast(this.i18n.t('toast.wave', { value: snapshot.wave }), 'warn');
      this.audio.playWarning();
      this.haptics.pulse([20, 30, 20]);
    }

  }

  private updateOverview(simulation: GameSimulation): void {
    const snapshot = simulation.getSnapshot();
    const origin = snapshot.player.position;
    const distanceTo = (x: number, y: number, z: number): number =>
      Math.hypot(x - origin.x, y - origin.y, z - origin.z);
    const objects: OverviewObject[] = [];

    for (const enemy of snapshot.enemies) {
      if (!enemy.alive) continue;
      objects.push({
        key: `hostile:${enemy.id}`,
        kind: 'hostile',
        id: enemy.id,
        name: `${this.i18n.t('hud.raider')} ${enemy.id}`,
        detail: this.i18n.t('hud.kind.hostile'),
        distance: distanceTo(enemy.position.x, enemy.position.y, enemy.position.z),
        color: '#ff6b78',
        ratio: enemy.maxHealth > 0 ? enemy.health / enemy.maxHealth : 0,
      });
    }

    for (const asteroid of snapshot.asteroids) {
      if (!asteroid.alive) continue;
      const label = this.i18n.resourceLabel(asteroid.resource);
      objects.push({
        key: `asteroid:${asteroid.id}`,
        kind: 'asteroid',
        id: asteroid.id,
        name: this.i18n.t('hud.asteroidName', { resource: label }),
        detail: label,
        distance: distanceTo(asteroid.position.x, asteroid.position.y, asteroid.position.z),
        color: RESOURCES[asteroid.resource].cssColor,
        ratio: asteroid.maxYield > 0 ? asteroid.yieldRemaining / asteroid.maxYield : 0,
      });
    }

    for (const planet of SOLAR_SYSTEM.planets) {
      const angle = planet.orbitIndex * 1.15 + 0.6;
      const orbit = planet.orbitRadius * 0.94;
      const x = Math.cos(angle) * orbit;
      const z = Math.sin(angle) * orbit;
      objects.push({
        key: `planet:${planet.id}`,
        kind: 'structure',
        id: planet.id,
        name: planet.name[this.i18n.lang],
        detail: this.i18n.resourceLabel(planet.uniqueResource),
        distance: distanceTo(x, 160, z),
        color: RESOURCES[planet.uniqueResource].cssColor,
      });
    }

    objects.sort((a, b) => a.distance - b.distance);
    const selected = this.selectedOverviewKey
      ? (objects.find((object) => object.key === this.selectedOverviewKey) ?? null)
      : null;
    if (!selected) this.selectedOverviewKey = null;
    const hostiles = objects.filter((object) => object.kind === 'hostile');
    const asteroids = objects
      .filter((object) => object.kind === 'asteroid')
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 20);
    const structures = objects.filter((object) => object.kind === 'structure');
    let visible = [...asteroids, ...hostiles, ...structures].sort(
      (a, b) => a.distance - b.distance,
    );
    if (selected && !visible.some((object) => object.key === selected.key)) {
      visible = [...visible, selected];
    }
    this.hud.updateOverview(visible, selected);
  }

  private refreshPanelState(): void {
    const profile = this.profileStorage.getActive();
    const credits = profile?.credits ?? 0;
    let cargoUsed = 0;
    let cargoCap = Math.floor(applyModulesToLoadout(this.selectedShip.loadout).cargoCapacity);
    let cargo: Partial<Record<ResourceKind, number>> = {};
    if (this.simulation) {
      const c = this.simulation.cargo;
      cargoUsed = Math.floor(c.used);
      cargoCap = Math.floor(c.capacity);
      cargo = { ...c.resources };
    }
    this.hud.setCredits(credits);
    const storage = (profile?.stationStorage ?? {}) as Partial<Record<ResourceKind, number>>;
    const storageUsed = Object.values(storage).reduce((a, b) => a + (b ?? 0), 0);
    const zoneId = this.activeZoneId(profile);
    const prices = this.ensureMarketPrices(profile, zoneId);
    const missingHull = this.simulation ? Math.max(0, this.simulation.player.maxHealth - this.simulation.player.health) : 0;
    const missingShield = this.simulation ? Math.max(0, this.simulation.player.maxShield - this.simulation.player.shield) : 0;
    this.market.setState({
      credits,
      cargo,
      cargoUsed,
      cargoCap,
      storage,
      storageUsed,
      storageCap: STATION_STORAGE_CAPACITY,
      ownedModules: normalizeOwnedModules(profile?.ownedModules),
      fittedModules: this.getFittedModuleCounts(profile),
      prices,
      zoneId,
      refineryQueue: profile?.refineryQueue ?? [],
      missions: profile?.missions ?? [],
      missionBoard: profile?.missionBoard ?? [],
      repair: { missingHull, missingShield, cost: getRepairCost(missingHull, missingShield) },
    });
    this.colony.setPlayerState({
      credits,
      resources: storage,
      plots: profile?.colonyPlots,
    });
  }

  /** Account for buffered ore before the player can accept new missions. */
  private flushSimulationEvents(): void {
    if (!this.simulation) return;
    this.simulation.flushPendingMining();
    const pending = this.simulation.drainEvents();
    if (pending.length > 0) this.handleEvents(pending);
  }

  private openMarket(): void {
    this.flushSimulationEvents();
    const profile = this.profileStorage.getActive();
    if (profile) this.ensureMissionBoard(profile);
    this.turnInDeliverMissions();
    this.updateMissionTracker();
    this.refreshPanelState();
    if (this.state === 'playing') this.pauseGame();
    this.market.setVisible(true);
    this.audio.playUi();
  }

  private openCodex(): void {
    if (this.state === 'playing') this.input.setEnabled(false);
    this.codex.refresh();
    this.codex.setVisible(true);
    this.audio.playUi();
  }

  private openColony(): void {
    this.refreshPanelState();
    if (this.state === 'playing') this.pauseGame();
    this.colony.setVisible(true);
    this.audio.playUi();
  }

  private saveFit(shipId: string, loadout: PlayerLoadout): void {
    const profile = this.profileStorage.getActive();
    if (!profile) return;
    const fittedModules = { ...(profile.fittedModules ?? {}) };
    fittedModules[shipId] = loadout.modules.map((m) => ({ moduleId: m.moduleId, slotIndex: m.slotIndex }));
    this.profileStorage.updateActive({ fittedModules });
    this.refreshPanelState();
  }

  /** 4D: fitted module counts across saved hulls (source of truth for sales). */
  private getFittedModuleCounts(profile: PilotProfile | null): Record<string, number> {
    const counts: Record<string, number> = {};
    const add = (moduleId: string) => { counts[moduleId] = (counts[moduleId] ?? 0) + 1; };
    if (profile?.fittedModules) {
      for (const list of Object.values(profile.fittedModules)) for (const m of list) add(m.moduleId);
    }
    return counts;
  }

  /** 4D: sell spare (unfitted) module copies. */
  private sellModule(moduleId: string, qty: number): void {
    const profile = this.profileStorage.getActive();
    if (!profile) return;
    const owned = normalizeOwnedModules(profile.ownedModules);
    const fitted = this.getFittedModuleCounts(profile);
    const free = Math.max(0, (owned[moduleId] ?? 0) - (fitted[moduleId] ?? 0));
    const q = Math.max(0, Math.min(Math.floor(qty || 1), free));
    if (q <= 0) return;
    const price = getModuleSellPrice(moduleId);
    owned[moduleId] = (owned[moduleId] ?? 0) - q;
    if (owned[moduleId] <= 0) delete owned[moduleId];
    const credits = profile.credits + price * q;
    this.profileStorage.updateActive({ credits, ownedModules: owned });
    this.hud.setCredits(credits);
    this.hud.creditToast(price * q);
    this.refreshPanelState();
    this.audio.playUi();
  }

  /** 4D: persisted market prices with slow drift + per-zone variation. */
  private ensureMarketPrices(profile: PilotProfile | null, zoneId: string): MarketPriceTable {
    const now = Date.now();
    const prices = refreshMarketPrices(profile?.marketPrices as MarketPriceTable | undefined, zoneId, now);
    if (profile) {
      const previous = profile.marketPrices as MarketPriceTable | undefined;
      const changed = !previous || RESOURCE_ORDER.some((kind) => previous[kind]?.buy !== prices[kind].buy);
      if (changed) this.profileStorage.updateActive({ marketPrices: prices });
    }
    return prices;
  }

  private getMarketPrice(kind: ResourceKind, side: 'buy' | 'sell'): number {
    const profile = this.profileStorage.getActive();
    const zoneId = this.activeZoneId(profile);
    const table = this.ensureMarketPrices(profile, zoneId);
    return table[kind]?.[side] ?? Math.round((RESOURCES[kind]?.value ?? 1) * 1.2);
  }

  /** Shared mission text resolver; no placeholder is ever left empty. */
  private missionTextContext(): MissionTextContext {
    const fallbackZone = this.activeZoneId(this.profileStorage.getActive());
    const zoneName = (id?: string): string => {
      const zone = ZONES.find((z) => z.id === (id ?? fallbackZone));
      const name = this.i18n.dir === 'rtl' ? zone?.name.ar : zone?.name.en;
      return name ?? id ?? fallbackZone ?? '—';
    };
    return {
      t: (key, params) => this.i18n.t(key as Parameters<I18n['t']>[0], params),
      resourceName: (id) => this.i18n.resourceLabel(id as ResourceKind),
      zoneName,
      stationName: (id) => {
        const zone = ZONES.find((z) => z.id === (id ?? HOME_STATION_ID));
        const name = this.i18n.dir === 'rtl' ? zone?.name.ar : zone?.name.en;
        return name ?? zoneName(fallbackZone);
      },
    };
  }

  /** Fill zone/station fields that older saves (or stale offers) are missing. */
  private normalizeMission(mission: MissionOffer, zoneId: string, now = Date.now()): MissionOffer {
    return normalizeMissionRecord(mission, zoneId, now);
  }

  /** 4D: generate a fresh 3-5 offer board when stale or in a new zone. */
  private ensureMissionBoard(profile: PilotProfile): void {
    const zoneId = this.activeZoneId(profile);
    const now = Date.now();
    const board = (profile.missionBoard ?? []).map((m) => this.normalizeMission(m, zoneId, now));
    const missions = (profile.missions ?? []).map((m) => this.normalizeMission(m, zoneId, now));
    const boardChanged = JSON.stringify(board) !== JSON.stringify(profile.missionBoard);
    const missionsChanged = JSON.stringify(missions) !== JSON.stringify(profile.missions);
    if (boardChanged || missionsChanged) {
      this.profileStorage.updateActive({
        missionBoard: boardChanged ? board : profile.missionBoard,
        missions: missionsChanged ? missions : profile.missions,
      });
    }
    const offers = board.filter((mission) => !mission.accepted);
    const inZone = offers.length > 0 && offers.every((mission) =>
      mission.type === 'deliver' ? true : mission.zoneId === zoneId,
    );
    const stale = now - (profile.missionBoardRefreshedAt ?? 0) > MISSION_BOARD_REFRESH_MS;
    if (!inZone || stale) {
      this.profileStorage.updateActive({
        missionBoard: generateMissionBoard(zoneId, now),
        missionBoardRefreshedAt: now,
      });
    }
  }

  private acceptMission(missionId: string): void {
    const profile = this.profileStorage.getActive();
    if (!profile) return;
    // 4D-fix round 2: the same pure action the headless tests use.
    const action = acceptOfferAction({
      missions: profile.missions ?? [],
      missionBoard: profile.missionBoard ?? [],
      missionId,
      zoneId: this.activeZoneId(profile),
      now: Date.now(),
      maxActive: MISSION_MAX_ACTIVE,
    });
    if (!action) return;
    this.profileStorage.updateActive(action);
    this.updateMissionTracker();
    this.refreshPanelState();
    this.audio.playUi();
  }

  private abandonMission(missionId: string): void {
    const profile = this.profileStorage.getActive();
    if (!profile) return;
    const action = abandonAction({
      missions: profile.missions ?? [],
      missionBoard: profile.missionBoard ?? [],
      missionId,
    });
    this.profileStorage.updateActive(action);
    this.updateMissionTracker();
    this.refreshPanelState();
    this.audio.playUi();
  }

  /**
   * 4D-fix: the single mission-progress entry point. Every gain path (mining,
   * pickups, kills, station deliveries) calls this, and unit tests call the
   * same pure `applyMissionEvent` function.
   */
  private handleMissionEvent(event: MissionGameEvent): void {
    this.recordMissionEvent(event);
    const profile = this.profileStorage.getActive();
    if (!profile) return;
    const missions = profile.missions ?? [];
    if (missions.length === 0) return;
    const updated = applyMissionEvent(missions, event);
    if (updated === missions) {
      this.updateMissionDebug();
      return;
    }
    // Toast only missions that crossed the target on this event.
    const wasReady = new Set(completedMissions(missions).map((m) => m.id));
    const newlyReady = completedMissions(updated).filter((m) => !wasReady.has(m.id));
    this.profileStorage.updateActive({ missions: updated });
    this.updateMissionTracker();
    // Only re-render the station panel when it is actually visible.
    if (this.market.isOpen) this.refreshPanelState();
    if (newlyReady.length > 0) {
      const ctx = this.missionTextContext();
      const message = this.i18n.t('mission.completeReady', {
        label: missionLabel(newlyReady[0], ctx),
        count: newlyReady.length,
      });
      this.hud.toast(message, 'good');
      if (this.market.isOpen) this.market.showToast(message);
      this.audio.playUi();
    }
  }

  /** 4D-fix: rewards are only paid when the player taps Claim reward. */
  private claimMission(missionId: string): void {
    const profile = this.profileStorage.getActive();
    if (!profile) return;
    const action = claimAction({
      missions: profile.missions ?? [],
      missionBoard: profile.missionBoard ?? [],
      missionId,
      credits: profile.credits,
      ownedModules: profile.ownedModules ?? {},
      score: profile.score ?? 0,
    });
    if (!action) return;
    this.profileStorage.updateActive(action);
    const claimMessage = this.i18n.t('mission.claimed', { credits: formatNumber(action.creditsGained) });
    this.hud.setCredits(action.credits);
    this.hud.creditToast(action.creditsGained);
    this.hud.toast(claimMessage, 'good');
    if (this.market.isOpen) this.market.showToast(claimMessage);
    if (action.moduleId) {
      const mod = getModuleById(action.moduleId);
      if (mod) {
        this.hud.toast(
          this.i18n.t('mission.moduleWon', { name: this.i18n.dir === 'rtl' ? mod.name.ar : mod.name.en }),
          'good',
        );
      }
    }
    this.updateMissionTracker();
    this.refreshPanelState();
    this.audio.playUi();
  }

  /** 4D-fix: hand cargo in at the station; emits `delivered` events. */
  private turnInDeliverMissions(): void {
    const profile = this.profileStorage.getActive();
    if (!profile) return;
    if (!(profile.missions ?? []).some((m) => m.accepted && !m.completed && m.type === 'deliver')) {
      return;
    }
    const cargo = this.simulation
      ? {
          resources: { ...this.simulation.cargo.resources } as Record<ResourceKind, number>,
          used: this.simulation.cargo.used,
          capacity: this.simulation.cargo.capacity,
        }
      : { resources: {} as Record<ResourceKind, number>, used: 0, capacity: 0 };
    const action = deliverMissionsAction({
      missions: profile.missions ?? [],
      cargoResources: { ...cargo.resources },
      cargoUsed: cargo.used,
      cargoCapacity: cargo.capacity,
      stationStorage: { ...(profile.stationStorage ?? {}) },
    });
    if (action.events.length === 0) return;
    if (this.simulation) {
      this.simulation.cargo.resources = {
        ...this.simulation.cargo.resources,
        ...(action.cargoResources as Record<ResourceKind, number>),
      };
      this.simulation.cargo.used = action.cargoUsed;
    }
    this.profileStorage.updateActive({
      missions: action.missions,
      stationStorage: action.stationStorage,
    });
    for (const delivered of action.events) {
      this.handleMissionEvent({
        type: 'delivered',
        resourceId: delivered.resourceId as ResourceKind,
        amount: delivered.amount,
        stationId: delivered.stationId,
        zoneId: this.currentZoneId,
      });
    }
  }

  private updateMissionTracker(): void {
    const profile = this.profileStorage.getActive();
    const missions = (profile?.missions ?? []).filter((m) => m.accepted);
    this.updateMissionDebug();
    if (missions.length === 0) {
      this.hud.setMissionTracker(null);
      this.hud.setMissionCards([]);
      return;
    }
    const ctx = this.missionTextContext();
    const cards = [...missions]
      .sort((a, b) => Number(missionIsReady(b)) - Number(missionIsReady(a)))
      .map((mission) => ({
        id: mission.id,
        label: missionLabel(mission, ctx),
        current: Math.floor(mission.current),
        amount: mission.amount,
        ready: missionIsReady(mission),
      }));
    this.hud.setMissionCards(cards);
    this.hud.setMissionTracker(
      this.i18n.t(cards[0].ready ? 'mission.trackerReady' : 'mission.tracker', {
        label: cards[0].label,
        current: cards[0].current,
        amount: cards[0].amount,
      }),
    );
  }

  /**
   * ?debug=1 only: small overlay listing the last 5 mission-facing game events
   * (mined / killed / delivered) and every active mission with live progress.
   * Never rendered without `debug=1` in the URL.
   */
  private setupMissionDebug(): void {
    const overlay = document.createElement('div');
    overlay.className = 'mission-debug';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
    this.debugOverlay = overlay;
    (window as unknown as Record<string, unknown>).__novaDebug = {
      app: this,
    };
    this.updateMissionDebug();
  }

  /** Records one mission-facing event for the ?debug=1 overlay. */
  private recordMissionEvent(event: MissionGameEvent): void {
    if (!this.debugEnabled) return;
    const detail =
      event.type === 'killed'
        ? `${event.type} @${event.zoneId ?? '?'}`
        : `${event.type} ${Math.round(event.amount ?? 0)} ${event.resourceId ?? ''} @${event.zoneId ?? '?'}`;
    this.debugEvents.unshift(detail);
    if (this.debugEvents.length > 5) this.debugEvents.length = 5;
  }

  /** Renders/refreshes the ?debug=1 overlay (events + active missions). */
  private updateMissionDebug(): void {
    if (!this.debugEnabled || !this.debugOverlay) return;
    const profile = this.profileStorage.getActive();
    const missions = (profile?.missions ?? []).filter((m) => m.accepted);
    const events = this.debugEvents;
    const lines: string[] = ['MISSION DEBUG'];
    lines.push('events (newest first):');
    if (events.length === 0) lines.push('  (none)');
    for (const event of events) lines.push(`  ${event}`);
    lines.push('active missions (profile.missions):');
    if (missions.length === 0) lines.push('  (none)');
    for (const mission of missions) {
      lines.push(
        `  ${mission.type} ${mission.target} ${Math.floor(mission.current)}/${mission.amount}` +
          (mission.completed ? ' READY' : '') +
          ` zone=${mission.zoneId ?? '-'}`,
      );
    }
    lines.push(`zone: ${this.currentZoneId} | board zone offers: ${(profile?.missionBoard ?? []).filter((m) => !m.accepted).length}`);
    this.debugOverlay.hidden = false;
    this.debugOverlay.style.display = 'block';
    this.debugOverlay.textContent = lines.join('\n');
  }

  private transferResource(kind: ResourceKind, qty: number, direction: 'store' | 'withdraw'): void {
    const profile = this.profileStorage.getActive();
    if (!profile) return;
    const storage = { ...(profile.stationStorage ?? {}) } as Record<ResourceKind, number>;
    const storageUsed = Object.values(storage).reduce((a, b) => a + (b ?? 0), 0);
    if (direction === 'store') {
      if (!this.simulation) return;
      const have = Math.floor(this.simulation.cargo.resources[kind] ?? 0);
      const space = Math.max(0, STATION_STORAGE_CAPACITY - storageUsed);
      const q = Math.max(0, Math.min(Math.floor(qty), have, space));
      if (q <= 0) return;
      this.simulation.cargo.resources[kind] = have - q;
      this.simulation.cargo.used = Math.max(0, this.simulation.cargo.used - q);
      storage[kind] = Math.floor(storage[kind] ?? 0) + q;
    } else {
      if (!this.simulation) return;
      const have = Math.floor(storage[kind] ?? 0);
      const space = Math.max(0, Math.floor(this.simulation.cargo.capacity - this.simulation.cargo.used));
      const q = Math.max(0, Math.min(Math.floor(qty), have, space));
      if (q <= 0) return;
      storage[kind] = have - q;
      this.simulation.cargo.resources[kind] = Math.floor(this.simulation.cargo.resources[kind] ?? 0) + q;
      this.simulation.cargo.used += q;
    }
    this.profileStorage.updateActive({ stationStorage: storage });
    this.refreshPanelState();
    this.audio.playUi();
  }

  private startRefine(recipeId: string, batches: number): void {
    const profile = this.profileStorage.getActive();
    const recipe = getRecipe(recipeId);
    if (!profile || !recipe) return;
    const amount = Math.max(1, Math.floor(batches || 1));
    const inputNeeded = recipe.inputAmount * amount;
    const cost = recipe.creditCost * amount;
    if (profile.credits < cost) return;
    const storage = { ...(profile.stationStorage ?? {}) } as Record<ResourceKind, number>;
    const cargoHave = this.simulation ? Math.floor(this.simulation.cargo.resources[recipe.input] ?? 0) : 0;
    const storeHave = Math.floor(storage[recipe.input] ?? 0);
    if (cargoHave + storeHave < inputNeeded) return;
    let need = inputNeeded;
    const takeCargo = Math.min(need, cargoHave);
    need -= takeCargo;
    const takeStorage = Math.min(need, storeHave);
    if (this.simulation && takeCargo > 0) {
      this.simulation.cargo.resources[recipe.input] = cargoHave - takeCargo;
      this.simulation.cargo.used = Math.max(0, this.simulation.cargo.used - takeCargo);
    }
    storage[recipe.input] = storeHave - takeStorage;
    const job = createRefineryJob(recipeId, Date.now(), amount);
    if (!job) return;
    this.profileStorage.updateActive({
      credits: profile.credits - cost,
      stationStorage: storage,
      refineryQueue: [...(profile.refineryQueue ?? []).filter((j) => !j.completed), job],
    });
    this.hud.setCredits(profile.credits - cost);
    this.hud.toast(this.i18n.t('toast.refining'), 'good');
    this.refreshPanelState();
    this.audio.playUi();
  }

  private collectRefine(jobId: string): void {
    const profile = this.profileStorage.getActive();
    if (!profile) return;
    const job = (profile.refineryQueue ?? []).find((j) => j.id === jobId);
    if (!job || refineJobRemaining(job, Date.now()) > 0) return;
    const recipe = getRecipe(job.recipeId);
    if (!recipe) return;
    const storage = { ...(profile.stationStorage ?? {}) } as Record<ResourceKind, number>;
    const output = recipe.outputAmount * job.amount;
    const used = Object.values(storage).reduce((a, b) => a + (b ?? 0), 0);
    if (used + output > STATION_STORAGE_CAPACITY) {
      this.hud.toast(this.i18n.t('toast.storageFull'), 'warn');
      return;
    }
    storage[recipe.output] = Math.floor(storage[recipe.output] ?? 0) + output;
    // Refinery output counts only when the owner rule enables it (default: no).
    if (MISSION_EVENT_RULES.countRefinery) {
      this.handleMissionEvent({
        type: 'mined',
        resourceId: recipe.output,
        amount: output,
        zoneId: this.currentZoneId,
        source: 'refinery',
      });
    }
    this.profileStorage.updateActive({
      stationStorage: storage,
      refineryQueue: (profile.refineryQueue ?? []).filter((j) => j.id !== jobId),
    });
    this.hud.toast(this.i18n.t('toast.refined', {
      amount: output,
      resource: this.i18n.resourceLabel(recipe.output),
    }), 'good');
    this.refreshPanelState();
    this.audio.playUi();
  }

  private repairShip(): void {
    const profile = this.profileStorage.getActive();
    if (!profile || !this.simulation) return;
    const ship = this.simulation.player;
    const missingHull = Math.max(0, ship.maxHealth - ship.health);
    const missingShield = Math.max(0, ship.maxShield - ship.shield);
    const cost = getRepairCost(missingHull, missingShield);
    if (cost <= 0 || profile.credits < cost) return;
    ship.health = ship.maxHealth;
    ship.shield = ship.maxShield;
    ship.shieldRegenTimer = 0;
    this.profileStorage.updateActive({ credits: profile.credits - cost });
    this.hud.setCredits(profile.credits - cost);
    this.hud.toast(this.i18n.t('toast.repaired', { cost: formatNumber(cost) }), 'good');
    this.refreshPanelState();
    this.audio.playUi();
  }

  /** Colony/market opened from the flight rail pause the run while they are up. */
  private openFlightPanel(panel: 'colony' | 'market'): void {
    if (panel === 'colony') this.openColony();
    else this.openMarket();
  }

  private selectOverviewObject(object: OverviewObject): void {
    this.selectedOverviewKey = object.key;
    this.hud.setSelectedObject(object);
    this.audio.playUi();
  }

  private handleObjectAction(action: ObjectAction, object: OverviewObject): void {
    const simulation = this.simulation;
    if (!simulation || this.state !== 'playing') return;
    switch (action) {
      case 'approach':
        this.input.setThrottle(1);
        this.hud.setThrottle(1);
        this.hud.toast(this.i18n.t('hud.approachSet'), 'info');
        break;
      case 'lock':
        if (object.kind === 'hostile' && typeof object.id === 'number') {
          simulation.setTargetEnemy(object.id);
          this.hud.trackTarget(object.id);
          this.hud.flashSystem('target');
          this.audio.playUi();
        }
        break;
      case 'fire':
        this.input.pulseFire();
        break;
      case 'mine':
        this.input.pulseMine();
        this.hud.toast(this.i18n.t('hud.mineEngaged'), 'info');
        break;
      case 'orbit':
      case 'warp':
        if (object.kind === 'structure') this.warpToPlanet(String(object.id));
        break;
    }
  }

  private updateEnemyMarkers(simulation: GameSimulation): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const marginX = 42;
    const marginTop = 76;
    const marginBottom = 128;
    const centerX = width / 2;
    const centerY = height / 2;
    const markers: EnemyMarker[] = [];

    for (const enemy of simulation.enemies) {
      if (!enemy.alive) continue;
      const point = this.renderer.projectWorldToScreen(enemy.position);
      const distance = Math.hypot(
        enemy.position.x - simulation.player.position.x,
        enemy.position.y - simulation.player.position.y,
        enemy.position.z - simulation.player.position.z,
      );
      let x = point.x;
      let y = point.y;
      let edge = false;
      let angle = 0;
      const inside =
        point.onScreen &&
        x > marginX &&
        x < width - marginX &&
        y > marginTop &&
        y < height - marginBottom;
      if (!inside) {
        let dx = point.x - centerX;
        let dy = point.y - centerY;
        if (point.behind) {
          dx = -dx;
          dy = -dy;
        }
        if (Math.abs(dx) + Math.abs(dy) < 0.001) {
          dx = 0;
          dy = -1;
        }
        const scaleX =
          dx > 0
            ? (width - marginX - centerX) / dx
            : dx < 0
              ? (marginX - centerX) / dx
              : Number.POSITIVE_INFINITY;
        const scaleY =
          dy > 0
            ? (height - marginBottom - centerY) / dy
            : dy < 0
              ? (marginTop - centerY) / dy
              : Number.POSITIVE_INFINITY;
        const scale = Math.max(0, Math.min(scaleX, scaleY));
        x = centerX + dx * scale;
        y = centerY + dy * scale;
        angle = Math.atan2(dy, dx) + Math.PI / 2;
        edge = true;
      }
      markers.push({
        id: enemy.id,
        distance,
        x,
        y,
        edge,
        angle,
        locked: enemy.id === simulation.targetEnemyId,
      });
    }
    this.hud.updateEnemyMarkers(markers);
  }

  private handleEvents(events: readonly GameEvent[]): void {
    this.renderer.handleEvents(events);
    for (const event of events) {
      switch (event.type) {
        case 'weapon-fired':
          this.audio.playLaser(event.team);
          if (event.team === 'player') {
            this.touch.pulseFire();
            this.hud.flashSystem('weapon');
          }
          break;
        case 'ship-hit':
          this.audio.playImpact(event.shieldAbsorbed);
          if (event.team === 'player') {
            const player = this.simulation?.player;
            let arc = 0;
            if (player) {
              const toSource = vec3Normalize(vec3Sub(event.source, player.position));
              arc =
                (Math.atan2(
                  vec3Dot(toSource, rightOf(player.quaternion)),
                  vec3Dot(toSource, forwardOf(player.quaternion)),
                ) *
                  180) /
                Math.PI;
            }
            this.hud.flashDamage(arc);
            this.haptics.pulse(event.shieldAbsorbed ? 18 : 35);
            if (!event.shieldAbsorbed) this.audio.playDamageAlarm();
          } else {
            this.markTutorial(true, false);
          }
          break;
        case 'ship-destroyed':
          this.audio.playExplosion(event.team === 'player' ? 1.7 : 0.9);
          if (event.team === 'enemy') this.haptics.pulse(22);
          break;
        case 'mined':
          this.handleMissionEvent({
            type: 'mined',
            resourceId: event.resourceId,
            amount: event.amount,
            zoneId: event.zoneId,
            source: event.source,
          });
          break;
        case 'killed':
          this.handleMissionEvent({
            type: 'killed',
            enemyId: event.enemyId,
            zoneId: event.zoneId,
          });
          break;
        case 'asteroid-depleted':
          this.audio.playAsteroidBreak();
          break;
        case 'ore-collected': {
          this.markTutorial(false, true);
          // Track discovery for the Resource Codex (profile migration supports discoveredResources).
          const profile = this.profileStorage.getActive();
          if (profile && !(profile.discoveredResources ?? []).includes(event.resource)) {
            const discoveredResources = [...(profile.discoveredResources ?? []), event.resource];
            this.profileStorage.updateActive({ discoveredResources });
          }
          if (this.oreSoundTimer - this.lastOreSound > 0.42) {
            this.lastOreSound = this.oreSoundTimer;
            this.audio.playOre();
          }
          if (this.oreToastTimer - this.lastOreToast > 0.9) {
            this.lastOreToast = this.oreToastTimer;
            this.hud.toast(
              this.i18n.t('toast.ore', {
                value: formatNumber(event.amount, event.amount < 10 ? 1 : 0),
                resource: this.i18n.resourceLabel(event.resource),
              }),
              'good',
            );
          }
          break;
        }
        case 'cargo-full':
          this.audio.playWarning();
          this.haptics.pulse(30);
          this.hud.toast(this.i18n.t('toast.cargoFull'), 'warn');
          break;
        case 'boundary-warning':
          if (event.active) {
            this.audio.playWarning();
            this.haptics.pulse([35, 40, 35]);
            this.hud.toast(this.i18n.t('toast.boundary'), 'warn');
          } else {
            this.hud.toast(this.i18n.t('toast.boundaryClear'), 'info');
          }
          break;
        case 'lock-changed':
          if (event.targetId !== null) this.haptics.pulse(8);
          break;
        case 'target-changed':
          this.audio.playLock(event.targetId !== null);
          if (event.targetId !== null) this.haptics.pulse(10);
          break;
        case 'enemy-spawned':
          this.audio.playWarpIn();
          break;
        case 'grace-ended':
          this.audio.playWarning();
          this.haptics.pulse([30, 25, 30]);
          this.hud.toast(this.i18n.t('toast.graceEnd'), 'warn');
          break;
        case 'player-destroyed':
          this.haptics.pulse([90, 45, 150]);
          this.beginDying();
          break;
        default:
          break;
      }
    }
  }

  private markTutorial(hitEnemy: boolean, minedOre: boolean): void {
    const wasComplete = this.tutorialHitEnemy && this.tutorialMinedOre;
    if (hitEnemy) this.tutorialHitEnemy = true;
    if (minedOre) this.tutorialMinedOre = true;
    if (
      !wasComplete &&
      this.tutorialHitEnemy &&
      this.tutorialMinedOre &&
      !this.tutorialSkipped
    ) {
      this.audio.playUi();
      this.haptics.pulse([12, 20, 12]);
      this.hud.toast(this.i18n.t('toast.tutorial'), 'good');
    }
  }

  private skipTutorial(): void {
    if (this.tutorialSkipped) return;
    this.tutorialSkipped = true;
    this.hud.updateTutorial({
      visible: false,
      hitEnemy: this.tutorialHitEnemy,
      minedOre: this.tutorialMinedOre,
    });
    this.audio.playUi();
  }

  private cycleTarget(): void {
    if (!this.simulation || this.state !== 'playing') return;
    const target = this.simulation.cycleTarget();
    this.audio.playLock(target !== null);
    if (target) {
      this.haptics.pulse(10);
      const distance = Math.hypot(
        target.position.x - this.simulation.player.position.x,
        target.position.y - this.simulation.player.position.y,
        target.position.z - this.simulation.player.position.z,
      );
      this.hud.toast(
        this.i18n.t('toast.target', { value: Math.round(distance) }),
        'info',
      );
    }
  }

  private changeDifficulty(difficulty: Difficulty): void {
    if (difficulty === this.settings.difficulty) return;
    this.settings = this.settingsStore.update({ difficulty });
    this.simulation?.setDifficulty(difficulty);
    this.menu.setDifficulty(difficulty);
    this.pause.setSettings(this.settings);
    this.audio.playUi();
  }

  private changeSettings(patch: Partial<UserSettings>): void {
    this.settings = this.settingsStore.update(patch);
    this.applyRuntimeSettings();
    this.pause.setSettings(this.settings);
    this.menu.setDifficulty(this.settings.difficulty);
    this.audio.playUi();
  }

  private applyRuntimeSettings(): void {
    this.input.setSensitivity(this.settings.sensitivity);
    this.hud.setDisplay(this.settings.hudScale, this.settings.hudOpacity);
    if (!this.simulation) return;
    this.simulation.setDifficulty(this.settings.difficulty);
    this.simulation.setSpeedScale(this.settings.speedScale);
    this.simulation.setAimAssist(this.settings.aimAssist);
    this.simulation.setAssistedFlight(this.settings.assistedFlight);
  }

  private beginDying(): void {
    if (this.state !== 'playing') return;
    this.setState('dying');
    this.gameOverTimer = 1.9;
    this.input.setEnabled(false);
    this.touch.setVisible(false);
    this.audio.updateEngine(0, false, false);
    this.audio.setMining(false);
  }

  private finishRun(): void {
    const simulation = this.simulation;
    if (!simulation) return;
    const snapshot = simulation.getSnapshot();
    const stats: GameOverStats = {
      score: snapshot.score,
      kills: snapshot.kills,
      ore: snapshot.cargo.used,
      time: snapshot.elapsed,
    };
    this.gameOver.setStats(stats);
    this.gameOver.setVisible(true);
    this.setState('gameover');
    this.touch.setVisible(false);
    this.hud.setVisible(false);
    this.input.setEnabled(false);
    this.audio.setPaused(true);
    this.renderer.render();
  }

  private startRun(): void {
    this.updatePilotName();
    if (!this.fleetReady) return;
    const ship = this.selectedShip;
    const loadout: PlayerLoadout = applyModulesToLoadout({
      ...ship.loadout,
      id: ship.id,
      modelId: ship.id,
    });
    const startZone = this.profileStorage.getActive()?.startingZone ?? 'nova-prime';
    this.currentZoneId = startZone;
    const simulation = new GameSimulation(loadout, {
      difficulty: this.settings.difficulty,
      speedScale: this.settings.speedScale,
      assistedFlight: this.settings.assistedFlight,
      aimAssist: this.settings.aimAssist,
      zoneId: startZone,
    });
    this.simulation = simulation;

    this.menu.hide();
    this.pause.setVisible(false);
    this.gameOver.setVisible(false);
    this.hud.setVisible(true);
    this.hud.clearToasts();
    this.hud.resetSession();
    this.hud.setArmorRating(ship.stats.armor);
    this.hud.setDisplay(this.settings.hudScale, this.settings.hudOpacity);
    this.selectedOverviewKey = null;
    this.overviewTimer = 0;
    this.touch.setVisible(this.touchCapable);
    this.touch.refresh();

    this.renderer.startGame(simulation, ship);
    // Launch at selected starting zone (menu/hangar map destination).
    this.renderer.setZone(startZone);
    const startPos = this.getZonePosition(startZone);
    simulation.teleportPlayer(startPos);
    this.renderer.snapCamera(simulation);
    this.hudTimer = 0;
    this.debugTimer = 0;
    this.oreToastTimer = 0;
    this.oreSoundTimer = 0;
    this.lastOreToast = -10;
    this.lastOreSound = -10;
    this.lastWave = 1;
    this.tutorialSkipped = false;
    this.tutorialHitEnemy = false;
    this.tutorialMinedOre = false;
    this.hud.updateTutorial({
      visible: true,
      hitEnemy: false,
      minedOre: false,
    });
    this.gameOverTimer = -1;
    this.applyRuntimeSettings();

    this.audio.setScene('game');
    this.audio.setPaused(false);
    this.audio.playUi();
    this.haptics.pulse(10);
    this.input.reset();
    this.input.setEnabled(true);
    this.setState('playing');
    this.updateMissionTracker();
    this.lastTime = performance.now();
  }

  private pauseGame(): void {
    if (this.state !== 'playing') return;
    this.flushSimulationEvents();
    this.setState('paused');
    this.input.setEnabled(false);
    this.touch.setVisible(false);
    this.pause.setQualityMode(this.renderer.quality.mode);
    this.pause.setSoundEnabled(this.audio.enabled);
    this.pause.setHapticsEnabled(this.haptics.enabled);
    this.pause.setSettings(this.settings);
    this.pause.setVisible(true);
    this.audio.setPaused(true);
  }

  private resumeGame(): void {
    if (this.state !== 'paused') return;
    this.pause.setVisible(false);
    this.input.setEnabled(true);
    this.touch.setVisible(this.touchCapable);
    this.audio.setPaused(false);
    this.setState('playing');
    this.lastTime = performance.now();
  }

  private togglePause(): void {
    if (this.state === 'playing') this.pauseGame();
    else if (this.state === 'paused') this.resumeGame();
  }

  private returnToHangar(): void {
    this.updatePilotName();
    if (!this.simulation) {
      this.menu.show();
      this.setState('menu');
      return;
    }
    this.simulation = null;
    this.setState('menu');
    this.input.setEnabled(false);
    this.touch.setVisible(false);
    this.hud.setVisible(false);
    this.pause.setVisible(false);
    this.gameOver.setVisible(false);
    this.renderer.showHangar(this.selectedShip);
    this.menu.setReady(this.fleetReady);
    this.menu.show();
    this.audio.setScene('hangar');
    this.audio.setPaused(false);
    this.audio.setMining(false);
    this.audio.updateEngine(0, false, false);
    this.lastTime = performance.now();
  }

  private selectShip(id: string): void {
    const ship = PLAYER_SHIPS.find((entry) => entry.id === id);
    if (!ship) return;
    this.selectedShip = ship;
    this.menu.selectShip(ship.id);
    this.audio.playUi();
    this.haptics.pulse(7);
    if (this.state === 'menu' || this.state === 'loading') {
      this.renderer.showHangar(ship);
    }
  }

  private toggleLanguage(): void {
    this.i18n.toggle();
    this.audio.playUi();
  }

  private toggleSound(): void {
    const enabled = this.audio.toggle();
    if (enabled) void this.audio.unlock();
    this.menu.setSoundEnabled(enabled);
    this.pause.setSoundEnabled(enabled);
    this.hud.setAudioEnabled(enabled);
    if (enabled) this.audio.playUi();
    this.haptics.pulse(6);
  }

  private toggleHaptics(): void {
    const enabled = !this.haptics.enabled;
    this.haptics.setEnabled(enabled);
    this.menu.setHapticsEnabled(enabled);
    this.pause.setHapticsEnabled(enabled);
    if (enabled) this.haptics.pulse(12);
    this.audio.playUi();
  }

  private toggleFps(): void {
    const showFps = !this.settings.showFps;
    this.settings = this.settingsStore.update({ showFps });
    this.menu.setFpsEnabled(showFps);
    this.hud.setFpsVisible(showFps);
    this.audio.playUi();
  }

  private setQualityMode(mode: QualityMode): void {
    this.renderer.quality.setMode(mode);
    this.pause.setQualityMode(this.renderer.quality.mode);
    this.audio.playUi();
  }

  private refreshLanguage(): void {
    this.menu.refresh();
    this.hud.refresh();
    this.pause.refresh();
    this.gameOver.refresh();
    this.touch.refresh();
    this.systemMap.refresh();
    this.updatePilotName();
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    canvas?.setAttribute('aria-label', this.i18n.t('a11y.gameCanvas'));
    const rotateTitle = document.querySelector<HTMLElement>('[data-rotate-title]');
    const rotateBody = document.querySelector<HTMLElement>('[data-rotate-body]');
    if (rotateTitle) rotateTitle.textContent = this.i18n.t('rotate.title');
    if (rotateBody) rotateBody.textContent = this.i18n.t('rotate.body');
  }

  private setState(state: AppState): void {
    this.state = state;
    document.body.dataset.novaState = state;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }
}

const showFatal = (error: unknown): void => {
  console.error('[Nova Fleet] Failed to start.', error);
  const uiRoot = document.querySelector<HTMLElement>('#ui-root');
  if (!uiRoot) return;
  const i18n = new I18n();
  const panel = el('div', 'fatal');
  panel.setAttribute('role', 'alert');
  panel.append(
    el('h2', 'fatal__title', i18n.t('app.title')),
    el('p', 'fatal__body', i18n.t('error.webgl')),
  );
  uiRoot.appendChild(panel);
};

try {
  const app = new NovaFleetApp();
  await app.start();
} catch (error) {
  showFatal(error);
}
