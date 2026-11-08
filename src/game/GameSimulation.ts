import { ENEMY_SHIP, RESOURCES } from '../assets-config';
import { createAIState, updateEnemyAI } from '../ai/EnemyAI';
import {
  DIFFICULTIES,
  ENEMY_TUNING,
  MAX_EVENTS,
  PLAYER_TUNING,
  RESOURCE_SPAWN_WEIGHTS,
  WAVE_TUNING,
  WORLD_TUNING,
  type Difficulty,
  type DifficultyTuning,
  type SimulationOptions,
} from './config';
import {
  Rng,
  clamp,
  damp,
  directionToQuat,
  forwardOf,
  qFromAxisAngle,
  qIdentity,
  qMultiply,
  qNormalize,
  rightOf,
  segmentSphereHit,
  upOf,
  vec3,
  vec3Add,
  vec3AddScaled,
  vec3Cross,
  vec3Distance,
  vec3DistanceSq,
  vec3Dot,
  vec3Length,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
  WORLD_UP,
} from './math';
import type { Rng as RngType, Vec3 } from './math';
import type {
  AsteroidEntity,
  CargoHold,
  GameEvent,
  GameStatus,
  MiningState,
  OrePickup,
  PlayerInput,
  PlayerLoadout,
  Projectile,
  ResourceKind,
  ShipEntity,
  SimulationSnapshot,
} from './types';
import { createEmptyInput } from './types';

const createShip = (
  id: number,
  team: 'player' | 'enemy',
  modelId: string,
  position: Vec3,
  radius: number,
): ShipEntity => ({
  id,
  team,
  modelId,
  position,
  previousPosition: { ...position },
  velocity: vec3(),
  quaternion: qIdentity(),
  bank: 0,
  radius,
  health: 1,
  maxHealth: 1,
  shield: 0,
  maxShield: 0,
  shieldRegenTimer: 0,
  hullRegenTimer: 0,
  alive: true,
  respawnTimer: 0,
  hitFlash: 0,
  warpTimer: 0,
  fireCooldown: 0,
  chargeTimer: 0,
  chargeTarget: null,
  fireInterval: PLAYER_TUNING.weapon.fireInterval,
  weaponDamage: PLAYER_TUNING.weapon.damage,
  projectileSpeed: PLAYER_TUNING.weapon.projectileSpeed,
  baseSpeed: PLAYER_TUNING.maxSpeed,
  turnRate: PLAYER_TUNING.turnRate,
  boost: PLAYER_TUNING.boost.capacity,
  boostLockTimer: 0,
  boosting: false,
  ai: null,
});

const pickResource = (rng: RngType): ResourceKind => {
  const roll = rng.next();
  let cursor = 0;
  for (const entry of RESOURCE_SPAWN_WEIGHTS) {
    cursor += entry.weight;
    if (roll <= cursor) return entry.kind;
  }
  return 'ferrite';
};

const randomSpin = (rng: RngType) => ({
  axis: rng.unitVector(),
  speed: rng.range(-0.35, 0.35),
});

const dampVec3 = (current: Vec3, target: Vec3, lambda: number, dt: number): Vec3 => ({
  x: damp(current.x, target.x, lambda, dt),
  y: damp(current.y, target.y, lambda, dt),
  z: damp(current.z, target.z, lambda, dt),
});

/**
 * Deterministic, renderer-free game simulation.
 * Everything the future multiplayer server would need lives in this module.
 */
export class GameSimulation {
  public readonly player: ShipEntity;
  public readonly enemies: ShipEntity[] = [];
  public readonly asteroids: AsteroidEntity[] = [];
  /** 4D: bonus ore pickups that fly into the ship after an asteroid breaks. */
  public readonly pickups: OrePickup[] = [];
  public readonly projectiles: Projectile[] = [];
  public readonly cargo: CargoHold;
  public readonly mining: MiningState;
  public readonly loadout: PlayerLoadout;

  public status: GameStatus = 'running';
  public score = 0;
  public kills = 0;
  public elapsed = 0;
  public boundaryWarning = false;
  public wave = 1;
  public readonly options: SimulationOptions;
  public graceRemaining: number = PLAYER_TUNING.gracePeriod;
  public targetEnemyId: number | null = null;

  private tuning: DifficultyTuning;
  private readonly rng: Rng;
  private readonly events: GameEvent[] = [];
  private projectileSeq = 1;
  private asteroidSeq = 1;
  private pickupSeq = 1;
  private enemySeq = 100;
  private shotSide = 1;
  private smoothedYaw = 0;
  private smoothedPitch = 0;
  private oreEventBuffer: { resource: ResourceKind; amount: number } | null = null;
  private oreEventTimer = 0;
  private cargoFullWarningTimer = 0;
  private wasBoundaryWarning = false;
  private extraSpawnTimer = 0;

  constructor(
    loadout: PlayerLoadout,
    options: Partial<SimulationOptions> = {},
    seed = WORLD_TUNING.seed,
  ) {
    this.loadout = loadout;
    this.options = {
      difficulty: options.difficulty ?? 'easy',
      speedScale: clamp(options.speedScale ?? 1, 0.5, 1.2),
      assistedFlight: options.assistedFlight ?? false,
      aimAssist: options.aimAssist ?? true,
      zoneId: options.zoneId ?? 'nova-prime',
    };
    this.tuning = DIFFICULTIES[this.options.difficulty];
    this.rng = new Rng(seed);
    this.cargo = {
      capacity: loadout.cargoCapacity,
      used: 0,
      resources: {
        ferrite: 0,
        aurium: 0,
        cryonite: 0,
        magmarite: 0,
        hexite: 0,
        thryxium: 0,
        nanocarbon: 0,
        isotopes: 0,
        alloys: 0,
      },
    };
    this.mining = {
      targetId: null,
      active: false,
      range: loadout.miningRange,
    };

    this.player = createShip(0, 'player', loadout.modelId, vec3(0, 0, 0), loadout.radius);
    this.applyPlayerLoadout();
    this.spawnAsteroidField();
    for (let i = 0; i < ENEMY_TUNING.baseCount; i += 1) {
      this.spawnEnemy();
    }
    for (let i = 0; i < WORLD_TUNING.maxProjectiles; i += 1) {
      this.projectiles.push({
        id: 0,
        team: 'player',
        position: vec3(),
        previousPosition: vec3(),
        origin: vec3(),
        velocity: vec3(),
        damage: 0,
        ttl: 0,
        active: false,
      });
    }
  }

  private applyPlayerLoadout(): void {
    const ship = this.player;
    const loadout = this.loadout;
    ship.maxHealth = loadout.maxHealth;
    ship.health = loadout.maxHealth;
    ship.maxShield = loadout.maxShield;
    ship.shield = loadout.maxShield;
    ship.fireInterval = loadout.fireInterval;
    ship.weaponDamage = loadout.weaponDamage;
    ship.projectileSpeed = loadout.projectileSpeed;
    ship.baseSpeed = loadout.baseSpeed;
    ship.turnRate = loadout.turnRate;
    ship.boost = loadout.boostCapacity;
    ship.quaternion = qIdentity();
    ship.velocity = vec3();
  }

  private spawnAsteroidField(): void {
    for (let i = 0; i < WORLD_TUNING.asteroidCount; i += 1) {
      this.asteroids.push(this.createAsteroid());
    }
  }

  private createAsteroid(excludeNear?: Vec3): AsteroidEntity {
    const angle = this.rng.range(0, Math.PI * 2);
    const radius = Math.sqrt(
      this.rng.range(
        WORLD_TUNING.fieldInnerRadius * WORLD_TUNING.fieldInnerRadius,
        WORLD_TUNING.fieldOuterRadius * WORLD_TUNING.fieldOuterRadius,
      ),
    );
    const position = vec3(
      Math.cos(angle) * radius,
      this.rng.range(-190, 190),
      Math.sin(angle) * radius,
    );
    if (excludeNear && vec3DistanceSq(position, excludeNear) < 360 * 360) {
      position.x += 480;
      position.z += 220;
    }
    const size = this.rng.range(WORLD_TUNING.asteroidMinRadius, WORLD_TUNING.asteroidMaxRadius);
    const spin = randomSpin(this.rng);
    const maxYield = Math.round(
      this.rng.range(WORLD_TUNING.asteroidMinYield, WORLD_TUNING.asteroidMaxYield),
    );
    return {
      id: this.asteroidSeq++,
      position,
      quaternion: qFromAxisAngle(this.rng.unitVector(), this.rng.range(0, Math.PI * 2)),
      spinAxis: spin.axis,
      spinSpeed: spin.speed,
      radius: size,
      maxYield,
      yieldRemaining: maxYield,
      resource: pickResource(this.rng),
      alive: true,
      respawnTimer: 0,
    };
  }

  /**
   * Picks a warp-in point in front of the player: at least
   * ENEMY_TUNING.spawnMinDistance away and inside a forward cone, so a new
   * contact is always visible (or immediately indicated by an edge marker).
   */
  private findSpawnPosition(): Vec3 {
    const forward = forwardOf(this.player.quaternion);
    const right = rightOf(this.player.quaternion);
    const up = upOf(this.player.quaternion);
    const cone = (ENEMY_TUNING.spawnConeDegrees * Math.PI) / 180;
    const minDot = Math.cos(
      cone + (ENEMY_TUNING.spawnConePaddingDegrees * Math.PI) / 180,
    );
    let fallback = vec3AddScaled(
      this.player.position,
      forward,
      ENEMY_TUNING.spawnPreferredMinDistance,
    );

    for (let attempt = 0; attempt < ENEMY_TUNING.spawnAttempts; attempt += 1) {
      const yaw = this.rng.range(-cone, cone);
      const lift = this.rng.range(
        -ENEMY_TUNING.spawnDirectionLift,
        ENEMY_TUNING.spawnDirectionLift,
      );
      const direction = vec3Normalize(
        vec3Add(
          vec3Add(
            vec3Scale(forward, Math.cos(yaw)),
            vec3Scale(right, Math.sin(yaw)),
          ),
          vec3Scale(up, lift),
        ),
      );
      const distance = this.rng.range(
        ENEMY_TUNING.spawnPreferredMinDistance,
        ENEMY_TUNING.spawnMaxDistance,
      );
      const candidate = vec3AddScaled(this.player.position, direction, distance);
      candidate.y += this.rng.range(
        -ENEMY_TUNING.spawnVerticalSpread,
        ENEMY_TUNING.spawnVerticalSpread,
      );
      const offset = vec3Sub(candidate, this.player.position);
      const actualDistance = vec3Length(offset);
      if (actualDistance < ENEMY_TUNING.spawnMinDistance) continue;
      if (vec3Dot(vec3Normalize(offset), forward) < minDot) continue;
      const blocked = this.asteroids.some(
        (asteroid) =>
          asteroid.alive &&
          vec3DistanceSq(asteroid.position, candidate) <
            (asteroid.radius + ENEMY_TUNING.spawnAsteroidClearance) *
              (asteroid.radius + ENEMY_TUNING.spawnAsteroidClearance),
      );
      if (!blocked) return candidate;
      fallback = candidate;
    }
    return fallback;
  }

  private applyEnemyTuning(ship: ShipEntity, preserveRatios = false): void {
    const healthMultiplier =
      this.tuning.enemyHealthMultiplier * (1 + (this.wave - 1) * WAVE_TUNING.healthPerWave);
    const nextMaxHealth = Math.max(1, Math.round(ENEMY_TUNING.maxHealth * healthMultiplier));
    const nextMaxShield = Math.max(
      0,
      Math.round(ENEMY_TUNING.maxShield * this.tuning.enemyHealthMultiplier),
    );
    const healthRatio = ship.maxHealth > 0 ? ship.health / ship.maxHealth : 1;
    const shieldRatio = ship.maxShield > 0 ? ship.shield / ship.maxShield : 1;
    ship.maxHealth = nextMaxHealth;
    ship.maxShield = nextMaxShield;
    ship.health = preserveRatios ? Math.max(1, nextMaxHealth * healthRatio) : nextMaxHealth;
    ship.shield = preserveRatios ? nextMaxShield * shieldRatio : nextMaxShield;

    const waveSpeed = 1 + (this.wave - 1) * WAVE_TUNING.speedPerWave;
    const firstWave = this.wave === 1 ? WAVE_TUNING.firstWaveSpeedScale : 1;
    ship.baseSpeed = ENEMY_TUNING.baseSpeed * this.tuning.enemySpeedMultiplier * firstWave * waveSpeed;
    ship.turnRate =
      ENEMY_TUNING.turnRate *
      this.tuning.enemyTurnMultiplier *
      (1 + (this.wave - 1) * WAVE_TUNING.speedPerWave);
    ship.fireInterval =
      (ENEMY_TUNING.fireInterval * this.tuning.enemyFireIntervalMultiplier) /
      (1 + (this.wave - 1) * WAVE_TUNING.fireIntervalPerWave);
    ship.weaponDamage =
      ENEMY_TUNING.weaponDamage *
      this.tuning.enemyDamageMultiplier *
      (1 + (this.wave - 1) * WAVE_TUNING.damagePerWave);
    ship.projectileSpeed = ENEMY_TUNING.projectileSpeed;
  }

  private placeEnemyForWarp(ship: ShipEntity): void {
    const position = this.findSpawnPosition();
    ship.position = position;
    ship.previousPosition = { ...position };
    ship.velocity = vec3();
    ship.quaternion = directionToQuat(vec3Sub(this.player.position, position));
    ship.warpTimer = ENEMY_TUNING.warpDuration;
    ship.fireCooldown = this.rng.range(
      ENEMY_TUNING.initialFireCooldownMin,
      ENEMY_TUNING.initialFireCooldownMax,
    );
    ship.chargeTimer = 0;
    ship.chargeTarget = null;
    ship.ai = createAIState(position, this.rng);
  }

  private spawnEnemy(): ShipEntity {
    const ship = createShip(
      this.enemySeq++,
      'enemy',
      ENEMY_SHIP.modelId,
      vec3(),
      ENEMY_SHIP.radius,
    );
    this.applyEnemyTuning(ship);
    this.placeEnemyForWarp(ship);
    this.enemies.push(ship);
    this.emit({
      type: 'enemy-spawned',
      shipId: ship.id,
      position: { ...ship.position },
      warpDuration: ENEMY_TUNING.warpDuration,
    });
    return ship;
  }

  private emit(event: GameEvent): void {
    if (this.events.length < MAX_EVENTS) this.events.push(event);
  }

  /** 4D-fix: flush buffered mining before pausing/docking, so ore gathered
   * before a mission was accepted is never attributed to it. */
  public flushPendingMining(): void {
    this.oreEventTimer = 0;
    this.flushOreEvents(0);
  }

  public drainEvents(): GameEvent[] {
    if (this.events.length === 0) return [];
    return this.events.splice(0, this.events.length);
  }

  public update(dtRaw: number, input: PlayerInput): void {
    if (this.status !== 'running') {
      this.updateEffectsOnly(dtRaw);
      return;
    }
    const dt = clamp(dtRaw, 0, 0.05);
    this.elapsed += dt;
    this.wave = 1 + Math.floor(this.kills / WAVE_TUNING.killsPerWave);
    if (this.graceRemaining > 0) {
      this.graceRemaining = Math.max(0, this.graceRemaining - dt);
      if (this.graceRemaining === 0) this.emit({ type: 'grace-ended' });
    }

    this.updatePlayer(dt, input);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateAsteroids(dt);
    this.updateMining(dt, input);
    this.updatePickups(dt);
    this.updateBoundary(dt);
    this.flushOreEvents(dt);

    for (const ship of [this.player, ...this.enemies]) {
      ship.hitFlash = Math.max(0, ship.hitFlash - dt);
    }

    if (!this.player.alive) {
      this.mining.active = false;
      this.player.boosting = false;
    }
  }

  private updateEffectsOnly(dtRaw: number): void {
    const dt = clamp(dtRaw, 0, 0.05);
    this.elapsed += dt;
    this.updateAsteroids(dt);
    for (const projectile of this.projectiles) {
      if (!projectile.active) continue;
      projectile.previousPosition = { ...projectile.position };
      projectile.position = vec3AddScaled(projectile.position, projectile.velocity, dt);
      projectile.ttl -= dt;
      if (projectile.ttl <= 0) projectile.active = false;
    }
    for (const ship of this.enemies) {
      ship.hitFlash = Math.max(0, ship.hitFlash - dt);
    }
    this.flushOreEvents(dt);
  }

  private desiredEnemyCount(): number {
    const waveCount =
      ENEMY_TUNING.baseCount + (this.wave - 1) * this.tuning.waveEnemyGrowth;
    return Math.min(WAVE_TUNING.maxEnemies, this.tuning.maxAliveEnemies, waveCount);
  }

  private updateEnemies(dt: number): void {
    let aliveCount = 0;
    for (const enemy of this.enemies) if (enemy.alive) aliveCount += 1;
    const desired = this.desiredEnemyCount();
    this.extraSpawnTimer = Math.max(0, this.extraSpawnTimer - dt);

    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        if (enemy.respawnTimer > 0) enemy.respawnTimer -= dt;
        if (enemy.respawnTimer <= 0 && aliveCount < desired && this.player.alive) {
          this.applyEnemyTuning(enemy);
          enemy.health = enemy.maxHealth;
          enemy.shield = enemy.maxShield;
          enemy.shieldRegenTimer = 0;
          enemy.hullRegenTimer = 0;
          this.placeEnemyForWarp(enemy);
          enemy.alive = true;
          enemy.respawnTimer = 0;
          aliveCount += 1;
          this.emit({
            type: 'enemy-spawned',
            shipId: enemy.id,
            position: { ...enemy.position },
            warpDuration: ENEMY_TUNING.warpDuration,
          });
        }
        continue;
      }

      if (enemy.warpTimer > 0) {
        enemy.warpTimer = Math.max(0, enemy.warpTimer - dt);
        enemy.velocity = dampVec3(enemy.velocity, vec3(), 4, dt);
        enemy.position = vec3AddScaled(enemy.position, enemy.velocity, dt);
        continue;
      }

      if (enemy.shieldRegenTimer > 0) {
        enemy.shieldRegenTimer -= dt;
      } else if (enemy.shield < enemy.maxShield) {
        enemy.shield = Math.min(
          enemy.maxShield,
          enemy.shield + ENEMY_TUNING.shieldRegen * dt,
        );
      }

      const intent = updateEnemyAI(enemy, this.player, dt, this.rng);
      const yawAngle = -intent.yaw * enemy.turnRate * dt;
      const pitchAngle = intent.pitch * enemy.turnRate * dt;
      enemy.quaternion = qNormalize(
        qMultiply(
          qMultiply(enemy.quaternion, qFromAxisAngle(WORLD_UP, yawAngle)),
          qFromAxisAngle({ x: 1, y: 0, z: 0 }, pitchAngle),
        ),
      );
      enemy.bank = damp(enemy.bank, -intent.yaw * 0.4, 4, dt);

      const forward = forwardOf(enemy.quaternion);
      const right = rightOf(enemy.quaternion);
      const desiredVelocity = vec3Add(
        vec3Scale(forward, enemy.baseSpeed * clamp(intent.throttle, -0.6, 1)),
        vec3Scale(
          right,
          enemy.baseSpeed * clamp(intent.strafe, -1, 1) * ENEMY_TUNING.strafeFactor,
        ),
      );
      enemy.velocity = dampVec3(enemy.velocity, desiredVelocity, ENEMY_TUNING.acceleration, dt);
      enemy.position = vec3AddScaled(enemy.position, enemy.velocity, dt);

      if (enemy.fireCooldown > 0) enemy.fireCooldown -= dt;

      if (enemy.chargeTimer > 0) {
        enemy.chargeTimer -= dt;
        if (enemy.chargeTimer <= 0 && enemy.chargeTarget) {
          this.fireEnemyWeapon(enemy, enemy.chargeTarget);
          enemy.chargeTarget = null;
          enemy.fireCooldown =
            enemy.fireInterval *
            this.rng.range(
              ENEMY_TUNING.fireCooldownJitterMin,
              ENEMY_TUNING.fireCooldownJitterMax,
            );
        }
      } else if (
        intent.fire &&
        enemy.fireCooldown <= 0 &&
        this.graceRemaining <= 0 &&
        this.player.alive
      ) {
        const aim = this.computeEnemyAim(enemy);
        enemy.chargeTimer = ENEMY_TUNING.telegraphDuration;
        enemy.chargeTarget = aim;
        const muzzle = vec3AddScaled(
          enemy.position,
          forwardOf(enemy.quaternion),
          ENEMY_SHIP.radius + ENEMY_TUNING.muzzleOffset,
        );
        this.emit({
          type: 'enemy-aiming',
          shipId: enemy.id,
          position: { ...muzzle },
          target: { ...aim },
          duration: ENEMY_TUNING.telegraphDuration,
        });
      }

      const distanceFromCenter = vec3Length(enemy.position);
      if (distanceFromCenter > WORLD_TUNING.hardBoundaryRadius + 350) {
        enemy.position = vec3Scale(vec3Normalize(enemy.position), WORLD_TUNING.softBoundaryRadius);
        if (enemy.ai) enemy.ai.anchor = { ...enemy.position };
      }
    }

    // Grow the roster only when a wave raises the cap. Dead slots already in
    // the roster return through their own respawn timer instead of being
    // duplicated, which keeps the enemy array bounded.
    if (
      aliveCount < desired &&
      this.enemies.length < desired &&
      this.extraSpawnTimer <= 0 &&
      this.player.alive
    ) {
      this.spawnEnemy();
      this.extraSpawnTimer = ENEMY_TUNING.extraSpawnInterval;
    }

    if (this.targetEnemyId !== null) {
      const target = this.getTargetEnemy();
      if (!target) {
        this.targetEnemyId = null;
        this.emit({ type: 'target-changed', targetId: null });
      }
    }
  }

  private computeEnemyAim(enemy: ShipEntity): Vec3 {
    const distance = vec3Distance(enemy.position, this.player.position);
    const lead = clamp(
      distance / Math.max(enemy.projectileSpeed, 1),
      0,
      ENEMY_TUNING.aimLeadMax,
    );
    const aim = vec3Add(
      this.player.position,
      vec3Scale(this.player.velocity, lead * ENEMY_TUNING.aimVelocityFactor),
    );
    const direction = vec3Normalize(vec3Sub(aim, enemy.position));
    const right = rightOf(enemy.quaternion);
    const up = upOf(enemy.quaternion);
    const spread = this.tuning.enemyAccuracySpread;
    const side = this.rng.range(-spread, spread);
    const vertical = this.rng.range(-spread, spread);
    const jittered = vec3Normalize(
      vec3Add(
        vec3Add(direction, vec3Scale(right, side)),
        vec3Scale(up, vertical),
      ),
    );
    return vec3Add(enemy.position, vec3Scale(jittered, distance));
  }

  private fireEnemyWeapon(enemy: ShipEntity, target: Vec3): void {
    const direction = vec3Normalize(vec3Sub(target, enemy.position));
    const position = vec3AddScaled(
      enemy.position,
      direction,
      ENEMY_SHIP.radius + ENEMY_TUNING.muzzleOffset,
    );
    this.spawnProjectile(
      'enemy',
      position,
      direction,
      enemy.projectileSpeed,
      enemy.weaponDamage,
      vec3(),
      ENEMY_TUNING.projectileTtl,
    );
    this.emit({
      type: 'weapon-fired',
      team: 'enemy',
      position: { ...position },
      direction: { ...direction },
    });
  }

  private updatePlayer(dt: number, input: PlayerInput): void {
    const ship = this.player;
    if (!ship.alive) return;
    this.smoothedYaw = damp(
      this.smoothedYaw,
      clamp(input.yaw, -1, 1),
      PLAYER_TUNING.steeringSmoothing,
      dt,
    );
    this.smoothedPitch = damp(
      this.smoothedPitch,
      clamp(input.pitch, -1, 1),
      PLAYER_TUNING.steeringSmoothing,
      dt,
    );

    const yawAngle = -this.smoothedYaw * ship.turnRate * dt;
    const pitchAngle =
      this.smoothedPitch * ship.turnRate * PLAYER_TUNING.pitchTurnFactor * dt;
    ship.quaternion = qNormalize(
      qMultiply(
        qMultiply(ship.quaternion, qFromAxisAngle(WORLD_UP, yawAngle)),
        qFromAxisAngle({ x: 1, y: 0, z: 0 }, pitchAngle),
      ),
    );
    ship.bank = damp(
      ship.bank,
      -this.smoothedYaw * PLAYER_TUNING.bankAmount,
      PLAYER_TUNING.bankSmoothing,
      dt,
    );

    if (this.options.assistedFlight && Math.abs(input.pitch) < 0.05) {
      const nose = forwardOf(ship.quaternion);
      const pitch = Math.asin(clamp(nose.y, -1, 1));
      const correction = -pitch * PLAYER_TUNING.assistedStabilize * dt;
      ship.quaternion = qNormalize(
        qMultiply(ship.quaternion, qFromAxisAngle({ x: 1, y: 0, z: 0 }, correction)),
      );
    }

    if (ship.boostLockTimer > 0) {
      ship.boostLockTimer -= dt;
      ship.boosting = false;
    } else if (input.boost && ship.boost > 0.5) {
      ship.boosting = true;
      ship.boost = Math.max(0, ship.boost - this.loadout.boostDrain * dt);
      if (ship.boost <= 0) {
        ship.boost = 0;
        ship.boosting = false;
        ship.boostLockTimer = PLAYER_TUNING.boost.lockout;
      }
    } else {
      ship.boosting = false;
      ship.boost = Math.min(
        this.loadout.boostCapacity,
        ship.boost + this.loadout.boostRegen * dt,
      );
    }

    const throttle = clamp(input.throttle, -1, 1);
    const ratedSpeed = ship.baseSpeed * this.options.speedScale;
    let targetForward =
      throttle >= 0
        ? ratedSpeed * throttle
        : ratedSpeed * throttle * PLAYER_TUNING.reverseSpeedFactor;
    if (ship.boosting) {
      targetForward = ratedSpeed * this.loadout.boostMultiplier;
    }

    const forward = forwardOf(ship.quaternion);
    const right = rightOf(ship.quaternion);
    const desired = vec3Add(
      vec3Scale(forward, targetForward),
      vec3Scale(
        right,
        clamp(input.strafe, -1, 1) * ratedSpeed * PLAYER_TUNING.strafeFactor,
      ),
    );
    const coasting = Math.abs(throttle) < 0.05;
    const acceleration = ship.boosting
      ? PLAYER_TUNING.boost.acceleration
      : coasting
        ? this.options.assistedFlight
          ? PLAYER_TUNING.assistedDrag
          : PLAYER_TUNING.coastDrag
        : PLAYER_TUNING.acceleration;
    ship.velocity = dampVec3(ship.velocity, desired, acceleration, dt);
    ship.position = vec3AddScaled(ship.position, ship.velocity, dt);

    if (ship.shieldRegenTimer > 0) {
      ship.shieldRegenTimer -= dt;
    } else if (ship.shield < ship.maxShield) {
      ship.shield = Math.min(ship.maxShield, ship.shield + this.loadout.shieldRegen * dt);
    }
    if (ship.hullRegenTimer > 0) {
      ship.hullRegenTimer -= dt;
    } else if (ship.health < ship.maxHealth && this.tuning.playerHullRegen > 0) {
      ship.health = Math.min(
        ship.maxHealth,
        ship.health + this.tuning.playerHullRegen * dt,
      );
    }

    if (ship.fireCooldown > 0) ship.fireCooldown -= dt;
    if (input.fire && ship.fireCooldown <= 0) {
      this.firePlayerWeapon();
      ship.fireCooldown = ship.fireInterval;
    }
  }

  private leadPoint(target: ShipEntity): Vec3 {
    const distance = vec3Distance(target.position, this.player.position);
    const travel = clamp(
      distance / Math.max(this.loadout.projectileSpeed, 1),
      0,
      PLAYER_TUNING.targetLeadMax,
    );
    return vec3AddScaled(target.position, target.velocity, travel);
  }

  private computePlayerAim(forward: Vec3, muzzle: Vec3): Vec3 {
    const assist = PLAYER_TUNING.aimAssist;
    if (!this.options.aimAssist) return forward;
    const locked = this.getTargetEnemy();
    let target = locked;
    if (!target) {
      const cosCone = Math.cos((assist.coneDegrees * Math.PI) / 180);
      let bestDot = cosCone;
      for (const enemy of this.enemies) {
        if (!enemy.alive || enemy.warpTimer > 0) continue;
        if (vec3Distance(enemy.position, this.player.position) > assist.range) continue;
        const toEnemy = vec3Normalize(vec3Sub(enemy.position, muzzle));
        const dot = vec3Dot(forward, toEnemy);
        if (dot > bestDot) {
          bestDot = dot;
          target = enemy;
        }
      }
    }
    if (!target || target.warpTimer > 0) return forward;
    const desired = vec3Normalize(vec3Sub(this.leadPoint(target), muzzle));
    const dot = vec3Dot(forward, desired);
    const cosCone = Math.cos((assist.coneDegrees * Math.PI) / 180);
    if (dot < cosCone) return forward;
    const blend = assist.strength * clamp((dot - cosCone) / (1 - cosCone), 0, 1);
    return vec3Normalize(vec3Add(forward, vec3Scale(vec3Sub(desired, forward), blend)));
  }

  private firePlayerWeapon(): void {
    const ship = this.player;
    const forward = forwardOf(ship.quaternion);
    const right = rightOf(ship.quaternion);
    const up = upOf(ship.quaternion);
    const muzzle = vec3AddScaled(
      vec3AddScaled(ship.position, forward, PLAYER_TUNING.weapon.muzzleOffset),
      right,
      this.shotSide * PLAYER_TUNING.weapon.muzzleSide,
    );
    muzzle.x -= up.x * PLAYER_TUNING.weapon.muzzleDrop;
    muzzle.y -= up.y * PLAYER_TUNING.weapon.muzzleDrop;
    muzzle.z -= up.z * PLAYER_TUNING.weapon.muzzleDrop;
    this.shotSide *= -1;
    const assisted = this.computePlayerAim(forward, muzzle);
    const jitter = PLAYER_TUNING.weapon.spread;
    const direction = vec3Normalize(
      vec3Add(
        vec3Add(assisted, vec3Scale(right, this.rng.range(-jitter, jitter))),
        vec3Scale(up, this.rng.range(-jitter, jitter)),
      ),
    );
    this.spawnProjectile(
      'player',
      muzzle,
      direction,
      this.loadout.projectileSpeed,
      this.loadout.weaponDamage,
      vec3Scale(ship.velocity, PLAYER_TUNING.weapon.inheritedVelocity),
      PLAYER_TUNING.weapon.ttl,
    );
    this.emit({
      type: 'weapon-fired',
      team: 'player',
      position: { ...muzzle },
      direction: { ...direction },
    });
  }

  private spawnProjectile(
    team: 'player' | 'enemy',
    position: Vec3,
    direction: Vec3,
    speed: number,
    damage: number,
    inheritedVelocity: Vec3,
    ttl: number,
  ): void {
    let slot = this.projectiles.find((projectile) => !projectile.active);
    if (!slot) {
      slot = this.projectiles.reduce((oldest, projectile) =>
        projectile.ttl < oldest.ttl ? projectile : oldest,
      );
    }
    slot.id = this.projectileSeq++;
    slot.team = team;
    slot.position = { ...position };
    slot.previousPosition = { ...position };
    slot.origin = { ...position };
    slot.velocity = vec3AddScaled(vec3Scale(direction, speed), inheritedVelocity, 1);
    slot.damage = damage;
    slot.ttl = ttl;
    slot.active = true;
  }

  private updateProjectiles(dt: number): void {
    for (const projectile of this.projectiles) {
      if (!projectile.active) continue;
      projectile.previousPosition = { ...projectile.position };
      projectile.position = vec3AddScaled(projectile.position, projectile.velocity, dt);
      projectile.ttl -= dt;
      if (projectile.ttl <= 0) {
        projectile.active = false;
        continue;
      }

      if (projectile.team === 'player') {
        for (const enemy of this.enemies) {
          if (!enemy.alive || enemy.warpTimer > 0) continue;
          if (
            segmentSphereHit(
              projectile.previousPosition,
              projectile.position,
              enemy.position,
              enemy.radius + 0.8,
            )
          ) {
            this.damageShip(
              enemy,
              projectile.damage,
              projectile.position,
              projectile.origin,
            );
            projectile.active = false;
            break;
          }
        }
      } else if (
        this.player.alive &&
        segmentSphereHit(
          projectile.previousPosition,
          projectile.position,
          this.player.position,
          this.player.radius + 0.65,
        )
      ) {
        this.damageShip(
          this.player,
          projectile.damage,
          projectile.position,
          projectile.origin,
        );
        projectile.active = false;
      }
    }
  }

  private damageShip(
    ship: ShipEntity,
    damage: number,
    hitPosition: Vec3,
    source: Vec3,
  ): void {
    let remaining = damage;
    let shieldAbsorbed = false;
    if (ship.shield > 0) {
      shieldAbsorbed = true;
      const absorbed = Math.min(ship.shield, remaining);
      ship.shield -= absorbed;
      remaining -= absorbed;
      ship.shieldRegenTimer =
        ship.team === 'player'
          ? this.tuning.playerShieldRegenDelay
          : ENEMY_TUNING.shieldRegenDelay;
    }
    if (remaining > 0) {
      ship.health = Math.max(0, ship.health - remaining);
      if (ship.team === 'player') {
        ship.hullRegenTimer = this.tuning.playerHullRegenDelay;
      }
    }
    ship.hitFlash = 0.16;
    this.emit({
      type: 'ship-hit',
      shipId: ship.id,
      team: ship.team,
      position: { ...hitPosition },
      source: { ...source },
      damage,
      shieldAbsorbed,
    });

    if (ship.health <= 0) {
      this.destroyShip(ship);
    }
  }

  private destroyShip(ship: ShipEntity): void {
    if (!ship.alive) return;
    ship.alive = false;
    ship.velocity = vec3();
    this.emit({
      type: 'ship-destroyed',
      shipId: ship.id,
      team: ship.team,
      position: { ...ship.position },
    });

    if (ship.team === 'enemy') {
      ship.respawnTimer =
        ENEMY_TUNING.respawnDelay + this.rng.range(0, ENEMY_TUNING.respawnJitter);
      ship.chargeTimer = 0;
      ship.chargeTarget = null;
      this.score += WORLD_TUNING.scorePerKill;
      this.kills += 1;
      this.emit({ type: 'killed', enemyId: ship.id, zoneId: this.options.zoneId });
      if (this.targetEnemyId === ship.id) {
        this.targetEnemyId = null;
        this.emit({ type: 'target-changed', targetId: null });
      }
    } else {
      this.status = 'destroyed';
      this.mining.active = false;
      for (const enemy of this.enemies) {
        enemy.chargeTimer = 0;
        enemy.chargeTarget = null;
      }
      this.emit({ type: 'player-destroyed', position: { ...ship.position } });
    }
  }

  private updateAsteroids(dt: number): void {
    const respawnBudget = Math.max(1, Math.floor(WORLD_TUNING.maxAsteroidRespawnsPerSecond * dt));
    let respawned = 0;
    for (const asteroid of this.asteroids) {
      if (asteroid.alive) {
        asteroid.quaternion = qNormalize(
          qMultiply(
            asteroid.quaternion,
            qFromAxisAngle(asteroid.spinAxis, asteroid.spinSpeed * dt),
          ),
        );
        continue;
      }
      asteroid.respawnTimer -= dt;
      if (asteroid.respawnTimer <= 0 && respawned < respawnBudget) {
        const angle = this.rng.range(0, Math.PI * 2);
        const radius = this.rng.range(
          WORLD_TUNING.fieldInnerRadius,
          WORLD_TUNING.fieldOuterRadius,
        );
        let position = vec3(
          Math.cos(angle) * radius,
          this.rng.range(-170, 170),
          Math.sin(angle) * radius,
        );
        if (vec3DistanceSq(position, this.player.position) < 320 * 320) {
          position = vec3AddScaled(position, vec3Normalize(position), 460);
        }
        asteroid.position = position;
        asteroid.radius = this.rng.range(
          WORLD_TUNING.asteroidMinRadius,
          WORLD_TUNING.asteroidMaxRadius,
        );
        asteroid.maxYield = Math.round(
          this.rng.range(WORLD_TUNING.asteroidMinYield, WORLD_TUNING.asteroidMaxYield),
        );
        asteroid.yieldRemaining = asteroid.maxYield;
        asteroid.resource = pickResource(this.rng);
        asteroid.quaternion = qFromAxisAngle(
          this.rng.unitVector(),
          this.rng.range(0, Math.PI * 2),
        );
        asteroid.alive = true;
        asteroid.respawnTimer = 0;
        respawned += 1;
      }
    }
  }

  private findMiningTarget(): AsteroidEntity | null {
    const ship = this.player;
    const forward = forwardOf(ship.quaternion);
    let best: AsteroidEntity | null = null;
    let bestScore = -Infinity;
    const cosCone = Math.cos((PLAYER_TUNING.mining.coneDegrees * Math.PI) / 180);
    for (const asteroid of this.asteroids) {
      if (!asteroid.alive || asteroid.yieldRemaining <= 0) continue;
      const toAsteroid = vec3Sub(asteroid.position, ship.position);
      const centerDistance = vec3Length(toAsteroid);
      const surfaceDistance = centerDistance - asteroid.radius;
      if (surfaceDistance > this.loadout.miningRange) continue;
      const dot = vec3Dot(forward, vec3Normalize(toAsteroid));
      if (dot < cosCone) continue;
      const score = dot * 2 - surfaceDistance / this.loadout.miningRange;
      if (score > bestScore) {
        bestScore = score;
        best = asteroid;
      }
    }
    return best;
  }

  private updateMining(dt: number, input: PlayerInput): void {
    this.cargoFullWarningTimer = Math.max(0, this.cargoFullWarningTimer - dt);
    const target = this.findMiningTarget();
    const nextTargetId = target?.id ?? null;
    if (nextTargetId !== this.mining.targetId) {
      this.mining.targetId = nextTargetId;
      this.emit({ type: 'lock-changed', targetId: nextTargetId });
    }

    const cargoFree = this.cargo.capacity - this.cargo.used;
    if (input.mine && cargoFree <= 0.01 && this.cargoFullWarningTimer <= 0) {
      this.cargoFullWarningTimer = 3.5;
      this.emit({ type: 'cargo-full', position: { ...this.player.position } });
    }

    const canMine =
      input.mine &&
      target !== null &&
      this.player.alive &&
      cargoFree > 0.01 &&
      this.status === 'running';

    this.mining.active = canMine;
    if (!canMine || !target) return;

    const amount = Math.min(
      this.loadout.miningRate * dt,
      target.yieldRemaining,
      this.cargo.capacity - this.cargo.used,
    );
    if (amount <= 0) return;
    target.yieldRemaining = Math.max(0, target.yieldRemaining - amount);
    this.cargo.used = Math.min(this.cargo.capacity, this.cargo.used + amount);
    this.cargo.resources[target.resource] += amount;
    this.score += amount * RESOURCES[target.resource].value * WORLD_TUNING.scorePerOre;
    // 4D-fix: one mission-facing event per mined chunk (never read from cargo).

    if (this.oreEventBuffer && this.oreEventBuffer.resource !== target.resource) {
      this.oreEventTimer = 0;
      this.flushOreEvents(0);
    }
    if (this.oreEventBuffer) {
      this.oreEventBuffer.amount += amount;
    } else {
      this.oreEventBuffer = { resource: target.resource, amount };
      this.oreEventTimer = 0.2;
    }

    if (target.yieldRemaining <= 0.001) {
      target.alive = false;
      target.respawnTimer =
        WORLD_TUNING.respawnAsteroidDelay + this.rng.range(-10, 18);
      this.emit({
        type: 'asteroid-depleted',
        asteroidId: target.id,
        position: { ...target.position },
        resource: target.resource,
      });
      // 4D: spawn a few bonus pickups that fly to the ship and auto-collect.
      const pickupCount = 2 + Math.floor(this.rng.range(0, 2));
      for (let i = 0; i < pickupCount; i += 1) {
        this.pickups.push({
          id: this.pickupSeq++,
          resource: target.resource,
          amount: 1 + Math.floor(this.rng.range(0, 2)),
          position: vec3Add(target.position, vec3(
            this.rng.range(-target.radius, target.radius),
            this.rng.range(-target.radius, target.radius),
            this.rng.range(-target.radius, target.radius),
          )),
          velocity: vec3(),
          ttl: 7,
          active: true,
        });
      }
      this.mining.targetId = null;
      this.mining.active = false;
      this.emit({ type: 'lock-changed', targetId: null });
    }
  }

  /** 4D: bonus pickups home in on the player and are auto-collected. */
  private updatePickups(dt: number): void {
    const player = this.player;
    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      pickup.ttl -= dt;
      if (pickup.ttl <= 0) {
        pickup.active = false;
        continue;
      }
      const toShip = vec3Sub(player.position, pickup.position);
      const distance = vec3Length(toShip);
      if (distance <= player.radius + 8) {
        const free = Math.max(0, this.cargo.capacity - this.cargo.used);
        if (free > 0.01) {
          const amount = Math.min(pickup.amount, free);
          this.cargo.resources[pickup.resource] += amount;
          this.cargo.used = Math.min(this.cargo.capacity, this.cargo.used + amount);
          this.score += amount * RESOURCES[pickup.resource].value * WORLD_TUNING.scorePerOre;
          this.emit({
            type: 'ore-collected',
            resource: pickup.resource,
            amount,
            total: this.cargo.used,
          });
          this.emit({
            type: 'mined',
            resourceId: pickup.resource,
            amount,
            zoneId: this.options.zoneId,
            source: 'pickup',
          });
          pickup.active = false;
        }
        continue;
      }
      const speed = 40 + (7 - pickup.ttl) * 48;
      pickup.position = vec3AddScaled(
        pickup.position,
        vec3Scale(toShip, 1 / Math.max(0.001, distance)),
        Math.min(distance, speed * dt),
      );
    }
  }

  private flushOreEvents(dt: number): void {
    if (!this.oreEventBuffer) return;
    this.oreEventTimer -= dt;
    if (this.oreEventTimer > 0) return;
    this.emit({
      type: 'ore-collected',
      resource: this.oreEventBuffer.resource,
      amount: this.oreEventBuffer.amount,
      total: this.cargo.used,
    });
    // 4D-fix: mission events are batched with the ore toast buffer (0.2s), so
    // mining does not write the profile on every frame.
    this.emit({
      type: 'mined',
      resourceId: this.oreEventBuffer.resource,
      amount: this.oreEventBuffer.amount,
      zoneId: this.options.zoneId,
      source: 'mining',
    });
    this.oreEventBuffer = null;
  }

  private updateBoundary(_dt: number): void {
    const distance = vec3Length(this.player.position);
    const warning = distance > WORLD_TUNING.softBoundaryRadius;
    if (warning !== this.wasBoundaryWarning) {
      this.wasBoundaryWarning = warning;
      this.boundaryWarning = warning;
      this.emit({ type: 'boundary-warning', active: warning });
    }
    if (distance > WORLD_TUNING.hardBoundaryRadius) {
      const inward = vec3Scale(vec3Normalize(this.player.position), -1);
      this.player.position = vec3Scale(
        vec3Normalize(this.player.position),
        WORLD_TUNING.hardBoundaryRadius,
      );
      this.player.velocity = vec3AddScaled(this.player.velocity, inward, 30);
    }
  }

  public getMiningTarget(): AsteroidEntity | null {
    if (this.mining.targetId === null) return null;
    return this.asteroids.find((asteroid) => asteroid.id === this.mining.targetId) ?? null;
  }

  public setDifficulty(difficulty: Difficulty): void {
    if (this.options.difficulty === difficulty) return;
    this.options.difficulty = difficulty;
    this.tuning = DIFFICULTIES[difficulty];
    for (const enemy of this.enemies) {
      if (enemy.alive) this.applyEnemyTuning(enemy, true);
    }
  }

  public setSpeedScale(scale: number): void {
    this.options.speedScale = clamp(scale, 0.5, 1.2);
  }

  /** 4D-fix: keep mission events carried on the zone the ship actually flies in. */
  public setZone(zoneId: string): void {
    this.options.zoneId = zoneId;
  }

  public setAssistedFlight(enabled: boolean): void {
    this.options.assistedFlight = enabled;
  }

  public setAimAssist(enabled: boolean): void {
    this.options.aimAssist = enabled;
  }

  public getTargetEnemy(): ShipEntity | null {
    if (this.targetEnemyId === null) return null;
    return this.enemies.find((enemy) => enemy.id === this.targetEnemyId && enemy.alive) ?? null;
  }

  /** Locks a specific raider (Overview "Lock" action). */
  public setTargetEnemy(id: number | null): ShipEntity | null {
    const enemy =
      id === null ? null : (this.enemies.find((item) => item.id === id && item.alive) ?? null);
    this.targetEnemyId = enemy?.id ?? null;
    this.emit({ type: 'target-changed', targetId: this.targetEnemyId });
    return enemy;
  }

  /** Cycles nearest-to-farthest through living raiders. */
  public cycleTarget(): ShipEntity | null {
    const alive = this.enemies
      .filter((enemy) => enemy.alive)
      .sort(
        (a, b) =>
          vec3DistanceSq(a.position, this.player.position) -
          vec3DistanceSq(b.position, this.player.position),
      );
    if (alive.length === 0) {
      this.targetEnemyId = null;
      this.emit({ type: 'target-changed', targetId: null });
      return null;
    }
    const currentIndex = alive.findIndex((enemy) => enemy.id === this.targetEnemyId);
    const next = alive[(currentIndex + 1) % alive.length];
    this.targetEnemyId = next.id;
    this.emit({ type: 'target-changed', targetId: next.id });
    return next;
  }

  public getTargetSolution(): { ship: ShipEntity; distance: number; lead: Vec3 } | null {
    const ship = this.getTargetEnemy();
    if (!ship) return null;
    return {
      ship,
      distance: vec3Distance(ship.position, this.player.position),
      lead: this.leadPoint(ship),
    };
  }

  public getSnapshot(): SimulationSnapshot {
    return {
      status: this.status,
      score: Math.floor(this.score),
      kills: this.kills,
      elapsed: this.elapsed,
      cargo: this.cargo,
      mining: this.mining,
      player: this.player,
      enemies: this.enemies,
      asteroids: this.asteroids,
      projectiles: this.projectiles,
      boundaryWarning: this.boundaryWarning,
      wave: this.wave,
      graceRemaining: this.graceRemaining,
      targetEnemyId: this.targetEnemyId,
    };
  }

  /** Exposed for tests/tools; no renderer state involved. */
  public teleportPlayer(position: Vec3): void {
    this.player.position = { ...position };
    this.player.velocity = vec3();
    this.player.previousPosition = { ...position };
  }

  /** Utility for future server snapshots. */
  public getForward(): Vec3 {
    return forwardOf(this.player.quaternion);
  }

  /** Used by AI tests / server-side sanity checks. */
  public getDistanceToPlayer(position: Vec3): number {
    return vec3Distance(position, this.player.position);
  }

  /** Creates a quaternion aimed at the player. Useful for spawn previews. */
  public aimAtPlayer(from: Vec3): { x: number; y: number; z: number; w: number } {
    return directionToQuat(vec3Sub(this.player.position, from));
  }

  /** Local basis helper used by tools and tests. */
  public getPlayerBasis(): { forward: Vec3; right: Vec3; up: Vec3 } {
    return {
      forward: forwardOf(this.player.quaternion),
      right: rightOf(this.player.quaternion),
      up: upOf(this.player.quaternion),
    };
  }

  /** Asteroid distribution summary, handy for debugging. */
  public countAliveAsteroids(): number {
    let count = 0;
    for (const asteroid of this.asteroids) if (asteroid.alive) count += 1;
    return count;
  }

  /** Cross product is re-exported through a method for deterministic tests. */
  public static cross(a: Vec3, b: Vec3): Vec3 {
    return vec3Cross(a, b);
  }

  public static emptyInput(): PlayerInput {
    return createEmptyInput();
  }
}
