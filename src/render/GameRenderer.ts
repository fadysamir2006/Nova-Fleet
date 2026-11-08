import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ENEMY_SHIP, PLAYER_SHIPS, RESOURCES, type ShipDefinition } from '../assets-config';
import { WORLD_TUNING } from '../game/config';
import type { GameEvent, ShipEntity } from '../game/types';
import { GameSimulation } from '../game/GameSimulation';
import type { Vec3 } from '../game/types';
import { AsteroidField } from './AsteroidField';
import { ChaseCamera } from './ChaseCamera';
import { HangarPreview } from './HangarPreview';
import { ProjectilePool } from './ProjectilePool';
import { QualityManager, type QualitySettings } from './QualityManager';
import { ShipLoader, type AssetProgress } from './ShipLoader';
import { ShipVisual } from './ShipVisual';
import { SpaceEnvironment } from './SpaceEnvironment';
import { createGlowTexture } from './textures';
import { VFX, type MiningBeamState } from './VFX';

export interface RenderStats {
  fps: number;
  quality: string;
  drawCalls: number;
  triangles: number;
  particles: number;
  pixelRatio: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
  distance: number;
  ndcX: number;
  ndcY: number;
  behind: boolean;
  onScreen: boolean;
}

type RenderMode = 'hangar' | 'game';

const enemyVisualConfig = {
  id: ENEMY_SHIP.modelId,
  modelPath: ENEMY_SHIP.modelPath,
  accent: '#ff5e4d',
  scale: 1,
};

export class GameRenderer {
  public readonly quality: QualityManager;
  public readonly shipLoader: ShipLoader;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;

  private readonly chaseCamera: ChaseCamera;
  private readonly environment: SpaceEnvironment;
  private readonly asteroidField: AsteroidField;
  /** 4D: bonus ore pickups after an asteroid breaks. */
  private readonly pickupMeshes = new Map<number, THREE.Mesh>();
  private readonly pickupGeometry = new THREE.OctahedronGeometry(1.4, 0);
  private readonly pickupMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly projectilePool: ProjectilePool;
  private readonly vfx: VFX;
  private readonly gameplayRoot = new THREE.Group();
  private readonly hangar: HangarPreview;
  private readonly glowTexture: THREE.Texture;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly outputPass: OutputPass;
  private readonly shipVisuals = new Map<number, ShipVisual>();
  private readonly enginePositions: THREE.Vector3[] = [];
  private readonly miningBeam: MiningBeamState = {
    origin: new THREE.Vector3(),
    target: new THREE.Vector3(),
    targetRadius: 1,
    color: 0x7ce8ff,
    active: false,
  };
  private readonly vector = new THREE.Vector3();
  private readonly vector2 = new THREE.Vector3();
  private readonly cameraSpace = new THREE.Vector3();
  private readonly stats: RenderStats = {
    fps: 60,
    quality: 'high',
    drawCalls: 0,
    triangles: 0,
    particles: 0,
    pixelRatio: 1,
  };
  private mode: RenderMode = 'hangar';
  private currentDefinition: ShipDefinition | null = null;
  private useComposer = false;
  private hangarTime = 0;
  private lastQuality: QualitySettings;
  private resizeHandler: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = false;
    this.renderer.info.autoReset = false;

    this.quality = new QualityManager();
    this.lastQuality = this.quality.current;
    this.scene = new THREE.Scene();
    this.scene.add(this.gameplayRoot);
    this.chaseCamera = new ChaseCamera(window.innerWidth / Math.max(window.innerHeight, 1));
    this.glowTexture = createGlowTexture('#bcefff', 0.04, 128);
    this.shipLoader = new ShipLoader(this.renderer);

    this.environment = new SpaceEnvironment(this.renderer, this.scene, this.quality.level);
    this.asteroidField = new AsteroidField(this.gameplayRoot, this.quality.level);
    this.projectilePool = new ProjectilePool(this.gameplayRoot, WORLD_TUNING.maxProjectiles);
    this.vfx = new VFX(this.gameplayRoot, this.glowTexture, this.quality.current);
    this.hangar = new HangarPreview(this.scene, this.glowTexture);
    this.hangar.setVisible(true);

    const initialTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: this.quality.current.msaaSamples,
    });
    this.composer = new EffectComposer(this.renderer, initialTarget);
    this.renderPass = new RenderPass(this.scene, this.chaseCamera.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.quality.current.bloomStrength,
      0.52,
      0.82,
    );
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);

    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler, { passive: true });
    window.addEventListener('orientationchange', this.resizeHandler, { passive: true });
    this.quality.onChange((settings) => this.applyQuality(settings));
    this.applyQuality(this.quality.current);
    this.resize();
  }

  public async loadFleet(onProgress?: (progress: AssetProgress) => void): Promise<void> {
    const definitions = [
      ...PLAYER_SHIPS.map((ship) => ({
        id: ship.id,
        modelPath: ship.modelPath,
        accent: ship.accent,
        scale: ship.scale,
      })),
      enemyVisualConfig,
    ];
    await this.shipLoader.loadShips(definitions, onProgress);
  }

  public showHangar(definition: ShipDefinition): void {
    this.mode = 'hangar';
    this.currentDefinition = definition;
    this.endGame();
    this.hangar.setVisible(true);
    const loaded = this.shipLoader.get(definition.id);
    if (loaded) {
      this.hangar.setModel(
        definition.id,
        loaded,
        definition.accent,
        definition.engineColor,
        definition.scale,
      );
    }
    this.gameplayRoot.visible = false;
    this.hangarTime = 0;
    this.useComposer = this.lastQuality.bloom;
    this.applyQuality(this.lastQuality);
  }

  public startGame(simulation: GameSimulation, definition: ShipDefinition): void {
    this.endGame();
    this.mode = 'game';
    this.currentDefinition = definition;
    this.gameplayRoot.visible = true;
    this.hangar.setVisible(false);

    const loadedPlayer = this.shipLoader.ensure(
      definition.id,
      definition.accent,
      definition.scale,
    );

    const playerVisual = new ShipVisual(this.gameplayRoot, {
      id: simulation.player.id,
      model: loadedPlayer,
      accent: definition.accent,
      engineColor: definition.engineColor,
      isPlayer: true,
      radius: simulation.player.radius,
      scale: definition.scale,
      glowTexture: this.glowTexture,
    });
    this.shipVisuals.set(simulation.player.id, playerVisual);

    for (const enemy of simulation.enemies) {
      this.ensureEnemyVisual(enemy);
    }

    this.projectilePool.clear();
    this.vfx.clear();
    this.chaseCamera.snapTo(simulation.player);
    this.useComposer = this.lastQuality.bloom;
    this.applyQuality(this.lastQuality);
    this.hangar.setVisible(false);
  }

  private ensureEnemyVisual(enemy: ShipEntity): ShipVisual {
    const existing = this.shipVisuals.get(enemy.id);
    if (existing) return existing;
    const model = this.shipLoader.ensure(
      ENEMY_SHIP.modelId,
      enemyVisualConfig.accent,
      enemyVisualConfig.scale,
    );
    const visual = new ShipVisual(this.gameplayRoot, {
      id: enemy.id,
      model,
      accent: enemyVisualConfig.accent,
      engineColor: '#ff6a4f',
      isPlayer: false,
      radius: enemy.radius,
      scale: enemyVisualConfig.scale,
      glowTexture: this.glowTexture,
    });
    this.shipVisuals.set(enemy.id, visual);
    return visual;
  }

  public handleEvents(events: readonly GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'weapon-fired': {
          this.vector.set(event.position.x, event.position.y, event.position.z);
          this.vfx.muzzleFlash(this.vector, event.team === 'player' ? 0x8fefff : 0xff644d);
          break;
        }
        case 'ship-hit': {
          this.vector.set(event.position.x, event.position.y, event.position.z);
          this.vfx.impact(
            this.vector,
            event.team === 'enemy' ? 0xffb36b : 0x7ce8ff,
            event.shieldAbsorbed,
            event.team === 'player' ? 12 : 8,
          );
          if (event.team === 'player') this.chaseCamera.addShake(event.shieldAbsorbed ? 0.35 : 0.7);
          break;
        }
        case 'ship-destroyed': {
          this.vector.set(event.position.x, event.position.y, event.position.z);
          this.vfx.explosion(this.vector, event.team === 'player' ? 1.8 : 1.1);
          if (event.team === 'player') this.chaseCamera.addShake(1.4);
          else this.chaseCamera.addShake(0.18);
          break;
        }
        case 'asteroid-depleted': {
          this.vector.set(event.position.x, event.position.y, event.position.z);
          this.vfx.asteroidBreak(this.vector, event.resource);
          break;
        }
        case 'enemy-spawned': {
          this.vector.set(event.position.x, event.position.y, event.position.z);
          this.vfx.enemySpawn(this.vector);
          break;
        }
        case 'enemy-aiming': {
          this.vector.set(event.position.x, event.position.y, event.position.z);
          this.vector2.set(event.target.x, event.target.y, event.target.z);
          this.vfx.enemyAim(this.vector, this.vector2, event.duration);
          break;
        }
        default:
          break;
      }
    }
  }

  public updateGame(dt: number, simulation: GameSimulation): void {
    this.quality.sample(dt);
    const player = simulation.player;
    for (const enemy of simulation.enemies) {
      if (enemy.alive) this.ensureEnemyVisual(enemy);
    }
    const playerVisual = this.shipVisuals.get(player.id);
    for (const [id, visual] of this.shipVisuals) {
      const ship =
        id === player.id ? player : simulation.enemies.find((enemy) => enemy.id === id);
      if (ship) visual.update(ship, dt);
    }

    if (playerVisual && player.alive) {
      const forward = playerVisual.getForward(this.vector);
      for (const [index, position] of playerVisual
        .getEngineWorldPositions(this.enginePositions)
        .entries()) {
        this.vfx.engineTrail(
          `player-${index}`,
          position,
          forward,
          playerVisual.getEngineColor(),
          player.boosting,
          dt,
        );
      }
    }

    for (const enemy of simulation.enemies) {
      if (!enemy.alive) continue;
      const visual = this.shipVisuals.get(enemy.id);
      if (!visual) continue;
      const forward = visual.getForward(this.vector);
      for (const [index, position] of visual.getEngineWorldPositions(this.enginePositions).entries()) {
        this.vfx.engineTrail(
          `enemy-${enemy.id}-${index}`,
          position,
          forward,
          visual.getEngineColor(),
          false,
          dt,
        );
      }
    }

    this.projectilePool.sync(simulation.projectiles);

    const miningTarget = simulation.getMiningTarget();
    if (simulation.mining.active && miningTarget && player.alive) {
      const forward = simulation.getForward();
      this.miningBeam.origin.set(
        player.position.x + forward.x * 4.2,
        player.position.y + forward.y * 4.2,
        player.position.z + forward.z * 4.2,
      );
      this.miningBeam.target.set(
        miningTarget.position.x,
        miningTarget.position.y,
        miningTarget.position.z,
      );
      this.miningBeam.targetRadius = miningTarget.radius;
      this.miningBeam.color = RESOURCES[miningTarget.resource].glow;
      this.miningBeam.active = true;
    } else {
      this.miningBeam.active = false;
    }
    this.vfx.setMiningBeam(this.miningBeam);

    this.chaseCamera.update(
      dt,
      player,
      Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z) /
        Math.max(player.baseSpeed, 1),
      player.boosting,
    );
    this.environment.update(
      dt,
      this.chaseCamera.camera,
      player.velocity,
      Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z) /
        Math.max(player.baseSpeed, 1),
      player.boosting ? 1 : 0,
    );
    this.asteroidField.update(
      simulation.asteroids,
      this.chaseCamera.camera.position,
      miningTarget,
      dt,
    );
    this.syncPickups(simulation);
    this.vfx.update(dt, this.chaseCamera.camera);
  }

  public updateHangar(dt: number): void {
    this.hangarTime += dt;
    this.hangar.update(dt);
    this.environment.update(dt, this.chaseCamera.camera, { x: 0, y: 0, z: 0 }, 0.1, 0);
    const camera = this.chaseCamera.camera;
    const angle = 0.32 + Math.sin(this.hangarTime * 0.12) * 0.32;
    const bob = Math.sin(this.hangarTime * 0.31) * 0.16;
    camera.position.set(Math.sin(angle) * 16.5, 3.6 + bob, -Math.cos(angle) * 17.5);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0.1 + bob * 0.3, 0);
    camera.fov = THREE.MathUtils.damp(camera.fov, 45, 3, dt);
    camera.updateProjectionMatrix();
  }

  public render(): void {
    this.renderer.info.reset();
    if (this.useComposer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.chaseCamera.camera);
    }
    this.stats.fps = this.quality.averageFps;
    this.stats.quality = this.quality.level;
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this.stats.particles = this.vfx.particles.activeCount;
    this.stats.pixelRatio = this.renderer.getPixelRatio();
  }

  public projectWorldToScreen(position: Vec3): ScreenPoint {
    this.vector.set(position.x, position.y, position.z);
    this.cameraSpace.copy(this.vector).applyMatrix4(this.chaseCamera.camera.matrixWorldInverse);
    const inFront = this.cameraSpace.z < -0.1;
    this.vector.project(this.chaseCamera.camera);
    const ndcX = this.vector.x;
    const ndcY = this.vector.y;
    const x = (ndcX * 0.5 + 0.5) * window.innerWidth;
    const y = (-ndcY * 0.5 + 0.5) * window.innerHeight;
    const distance = this.cameraSpace.length();
    const onScreen =
      inFront && ndcX > -1 && ndcX < 1 && ndcY > -1 && ndcY < 1;
    return {
      x,
      y,
      visible:
        inFront &&
        x > -80 &&
        x < window.innerWidth + 80 &&
        y > -80 &&
        y < window.innerHeight + 80,
      distance,
      ndcX,
      ndcY,
      behind: !inFront,
      onScreen,
    };
  }

  public getStats(): RenderStats {
    return this.stats;
  }

  /** Per-zone environment tint (4C). Render-only. */
  public setZone(zoneId: string): void {
    this.environment.setZone(zoneId);
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.chaseCamera.camera;
  }

  /** Snaps the chase camera to the ship after a teleport/warp. */
  public snapCamera(simulation: GameSimulation): void {
    this.chaseCamera.snapTo(simulation.player);
  }

  public getCurrentDefinition(): ShipDefinition | null {
    return this.currentDefinition;
  }

  public getMode(): RenderMode {
    return this.mode;
  }

  public dispose(): void {
    this.endGame();
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('orientationchange', this.resizeHandler);
    this.hangar.dispose();
    this.vfx.dispose();
    this.projectilePool.dispose();
    this.asteroidField.dispose();
    this.environment.dispose();
    this.shipLoader.dispose();
    this.glowTexture.dispose();
    this.bloomPass.dispose();
    this.outputPass.dispose();
    this.renderPass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }

  /** 4D: draw the bonus ore pickups that fly toward the ship. */
  private syncPickups(simulation: GameSimulation): void {
    const seen = new Set<number>();
    for (const pickup of simulation.pickups) {
      if (!pickup.active) continue;
      seen.add(pickup.id);
      let mesh = this.pickupMeshes.get(pickup.id);
      if (!mesh) {
        let material = this.pickupMaterials.get(pickup.resource);
        if (!material) {
          material = new THREE.MeshBasicMaterial({
            color: RESOURCES[pickup.resource].glow,
            transparent: true,
            opacity: 0.92,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          this.pickupMaterials.set(pickup.resource, material);
        }
        mesh = new THREE.Mesh(this.pickupGeometry, material);
        this.pickupMeshes.set(pickup.id, mesh);
        this.gameplayRoot.add(mesh);
      }
      mesh.position.set(pickup.position.x, pickup.position.y, pickup.position.z);
      mesh.rotation.y += 0.08;
      mesh.rotation.x += 0.03;
      mesh.scale.setScalar(0.85 + Math.sin((7 - pickup.ttl) * 8) * 0.15);
    }
    for (const [id, mesh] of this.pickupMeshes) {
      if (seen.has(id)) continue;
      this.gameplayRoot.remove(mesh);
      this.pickupMeshes.delete(id);
    }
  }

  private endGame(): void {
    for (const visual of this.shipVisuals.values()) visual.dispose();
    this.shipVisuals.clear();
    for (const mesh of this.pickupMeshes.values()) this.gameplayRoot.remove(mesh);
    this.pickupMeshes.clear();
    this.vfx.clear();
    this.projectilePool.clear();
    this.miningBeam.active = false;
    this.vfx.setMiningBeam(this.miningBeam);
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    this.chaseCamera.resize(width, height);
    this.applyQuality(this.lastQuality);
  }

  private applyQuality(settings: QualitySettings): void {
    this.lastQuality = settings;
    const ratio = Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio);
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    const drawingBuffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.bloomPass.resolution.set(drawingBuffer.x, drawingBuffer.y);
    this.bloomPass.strength = settings.bloomStrength;
    this.bloomPass.threshold = 0.82;
    this.bloomPass.enabled = settings.bloom;
    this.renderer.toneMappingExposure = settings.level === 'low' ? 1.02 : 1.08;
    this.useComposer = settings.bloom;
    this.environment.setQuality(settings.level);
    this.asteroidField.setQuality(settings.level);
    this.vfx.setQuality(settings);
    this.chaseCamera.camera.updateProjectionMatrix();

    if (this.composer.renderTarget1.samples !== settings.msaaSamples) {
      this.composer.renderTarget1.samples = settings.msaaSamples;
      this.composer.renderTarget2.samples = settings.msaaSamples;
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    this.stats.pixelRatio = ratio;
    this.stats.quality = settings.level;
  }
}
