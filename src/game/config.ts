import type { PlayerLoadout, ResourceKind } from './types';

/**
 * Nova Fleet central gameplay tuning.
 *
 * Every speed, damage, regeneration, spawn and wave number used by the
 * simulation lives here. Render/UI code may import this file, but this file
 * must never import Three.js or DOM APIs.
 *
 * Wave 1 defaults: two enemies, low speed, 15-second no-fire grace period.
 * Easy is the default difficulty; enemy damage is 40% and shields return
 * after three seconds without damage.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';

/** Starting credits for a new pilot profile. */
export const STARTING_CREDITS = 15000;
/** Market sell price as a fraction of the module buy price (4D). */
export const MODULE_SELL_RATE = 0.6;
/** Payouts at or above this amount ask for confirmation before selling (4D). */
export const MODULE_SELL_CONFIRM_CREDITS = 20000;
/** Station storage capacity, separate from ship cargo (4D). */
export const STATION_STORAGE_CAPACITY = 500;

/**
 * 4D station economy tuning: resource price drift and per-zone variation.
 * Kept here so the future server can reproduce the same prices.
 */
export const MARKET_TUNING = {
  /** Prices are recomputed in buckets of this length. */
  driftPeriodMs: 5 * 60 * 1000,
  /** Base sell price as a fraction of the resource value. */
  sellBase: 1.2,
  /** Station asks more than it pays. */
  buyMarkup: 1.18,
  /** +/- 16% swing from the drift wave. */
  driftAmplitude: 0.16,
  /** Each danger level above 2 raises local prices by 4.5%. */
  dangerStep: 0.045,
  /** Locally produced resources are this fraction of the base price. */
  localResourceFactor: 0.82,
  /** Stations pay slightly more than open-space zones. */
  stationFactor: 1.05,
  zoneFactorMin: 0.68,
  zoneFactorMax: 1.45,
} as const;

/** 4D station repair pricing (credits per missing hull/shield point). */
export const REPAIR_TUNING = {
  perHull: 1.2,
  perShield: 0.8,
} as const;

/** 4D station mission board tuning (offer count, rewards, scaling by danger). */
export const MISSION_TUNING = {
  refreshMs: 10 * 60 * 1000,
  minOffers: 3,
  maxOffers: 5,
  /** Chance an offer also pays a module. */
  moduleRewardChance: 0.28,
  moduleRewardCostBase: 12000,
  moduleRewardCostPerDanger: 9000,
  mine: { base: 90, perUnit: 14, amountBase: 18, amountPerDanger: 8, amountRandom: 18 },
  destroy: { base: 260, perKill: 180, amountBase: 2, amountPerDanger: 0.8, amountRandom: 2 },
  deliver: { base: 130, perUnit: 22, amountBase: 8, amountPerDanger: 4, amountRandom: 10 },
} as const;

/**
 * 4D-fix: which gain sources count toward mission progress. Progress is
 * event-based (never derived from cargo), so moving or selling ore cannot
 * change it. The owner rule: mined and picked-up units count, refinery
 * output does not.
 */
export const MISSION_EVENT_RULES = {
  countPickups: true,
  countRefinery: false,
  /** Deliver missions only progress when cargo is handed over at a station. */
  deliverAtStationOnly: true,
  /** Mine/destroy missions with a zone only progress inside that zone. */
  enforceZone: true,
} as const;

/** Maximum accepted (unclaimed) missions at once. */
export const MISSION_MAX_ACTIVE = 3;

export interface BoostTuning {
  multiplier: number;
  capacity: number;
  drain: number;
  regen: number;
  lockout: number;
  acceleration: number;
}

export interface WeaponTuning {
  fireInterval: number;
  damage: number;
  projectileSpeed: number;
  ttl: number;
  spread: number;
  inheritedVelocity: number;
  muzzleOffset: number;
  muzzleSide: number;
  muzzleDrop: number;
}

export interface AimAssistTuning {
  /** Half-angle of the soft aim cone. */
  coneDegrees: number;
  range: number;
  /** 0 = none, 1 = fully snap to the lead solution. */
  strength: number;
}

export const PLAYER_TUNING = {
  /** Reference hull values before per-ship modifiers. */
  hull: 150,
  shield: 100,
  shieldRegen: 9,
  shieldRegenDelay: 4.5,
  hullRegen: 1.1,
  hullRegenDelay: 12,
  /** 40% below the phase-one values (Skylance used to reach 82 m/s at 1.82 rad/s). */
  maxSpeed: 50,
  turnRate: 1.05,
  pitchTurnFactor: 0.82,
  /** Damping lambdas: lower = smoother ramp, higher = quicker response. */
  acceleration: 1.2,
  coastDrag: 1.8,
  assistedDrag: 2.6,
  steeringSmoothing: 7.5,
  bankSmoothing: 4.2,
  assistedStabilize: 1.8,
  strafeFactor: 0.58,
  reverseSpeedFactor: 0.4,
  bankAmount: 0.52,
  targetLeadMax: 1.6,
  boost: {
    multiplier: 1.85,
    capacity: 100,
    drain: 30,
    regen: 20,
    lockout: 2.4,
    acceleration: 2.2,
  } satisfies BoostTuning,
  weapon: {
    fireInterval: 0.16,
    damage: 12,
    projectileSpeed: 650,
    ttl: 3.2,
    spread: 0.003,
    inheritedVelocity: 0.3,
    muzzleOffset: 4.3,
    muzzleSide: 2.35,
    muzzleDrop: 0.55,
  } satisfies WeaponTuning,
  mining: {
    rate: 4.8,
    range: 230,
    coneDegrees: 26,
  },
  cargoCapacity: 40,
  radius: 4.6,
  aimAssist: {
    coneDegrees: 5,
    range: 900,
    strength: 0.32,
  } satisfies AimAssistTuning,
  cameraShake: 0.45,
  boostFov: 5,
  gracePeriod: 15,
} as const;

export interface ShipTuning {
  hull: number;
  shield: number;
  speed: number;
  turn: number;
  damage: number;
  /** > 1 fires faster. */
  fireRate: number;
  miningRate: number;
  cargo: number;
  radius: number;
  boost: number;
}

export const SHIP_TUNING: Record<string, ShipTuning> = {
  helix: {
    hull: 1.16,
    shield: 1.36,
    speed: 0.94,
    turn: 1.0,
    damage: 0.44,
    fireRate: 0.68,
    miningRate: 0.95,
    cargo: 1.08,
    radius: 5.4,
    boost: 1.0,
  },
  ironharrow: {
    hull: 1.8,
    shield: 1.26,
    speed: 0.76,
    turn: 0.74,
    damage: 2.05,
    fireRate: 0.82,
    miningRate: 0.56,
    cargo: 0.92,
    radius: 7.8,
    boost: 0.88,
  },
  deepmaw: {
    hull: 1.12,
    shield: 0.88,
    speed: 0.92,
    turn: 0.86,
    damage: 0.58,
    fireRate: 0.56,
    miningRate: 2.9,
    cargo: 2.9,
    radius: 6.6,
    boost: 1.02,
  },
};

/** Builds the final loadout so ships only carry multipliers, not free-floating numbers. */
export const buildPlayerLoadout = (id: string, modelId: string): PlayerLoadout => {
  const ship = SHIP_TUNING[id] ?? SHIP_TUNING.deepmaw;
  const p = PLAYER_TUNING;
  const hullClass = id;
  const cpuCapacity =
    hullClass === 'helix' ? 375 : hullClass === 'ironharrow' ? 290 : 215;
  const powergridCapacity =
    hullClass === 'helix' ? 290 : hullClass === 'ironharrow' ? 380 : 225;
  // Per-hull slot limits (no global weapon cap). Support H2/M4/L3, Combat H5/M3/L3, Mining H3/M3/L4.
  const highSlots = hullClass === 'helix' ? 2 : hullClass === 'ironharrow' ? 5 : 3;
  const midSlots = hullClass === 'helix' ? 4 : hullClass === 'ironharrow' ? 3 : 3;
  const lowSlots = hullClass === 'helix' ? 3 : hullClass === 'ironharrow' ? 3 : 4;
  return {
    id,
    modelId,
    maxHealth: Math.round(p.hull * ship.hull),
    maxShield: Math.round(p.shield * ship.shield),
    shieldRegen: p.shieldRegen,
    shieldRegenDelay: p.shieldRegenDelay,
    baseSpeed: p.maxSpeed * ship.speed,
    boostMultiplier: p.boost.multiplier * ship.boost,
    boostCapacity: p.boost.capacity,
    boostDrain: p.boost.drain,
    boostRegen: p.boost.regen,
    turnRate: p.turnRate * ship.turn,
    fireInterval: p.weapon.fireInterval / ship.fireRate,
    weaponDamage: p.weapon.damage * ship.damage,
    projectileSpeed: p.weapon.projectileSpeed,
    miningRate: p.mining.rate * ship.miningRate,
    miningRange: p.mining.range,
    cargoCapacity: Math.round(p.cargoCapacity * ship.cargo),
    radius: ship.radius,
    cpuCapacity,
    powergridCapacity,
    highSlots,
    midSlots,
    lowSlots,
    modules: [],
  };
};

export interface DifficultyTuning {
  enemyDamageMultiplier: number;
  /** Extra radians added to every enemy shot. Larger = less accurate. */
  enemyAccuracySpread: number;
  /** > 1 = slower enemy trigger. */
  enemyFireIntervalMultiplier: number;
  enemySpeedMultiplier: number;
  enemyTurnMultiplier: number;
  enemyHealthMultiplier: number;
  playerShieldRegenDelay: number;
  playerHullRegen: number;
  playerHullRegenDelay: number;
  maxAliveEnemies: number;
  waveEnemyGrowth: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyTuning> = {
  easy: {
    enemyDamageMultiplier: 0.4,
    enemyAccuracySpread: 0.075,
    enemyFireIntervalMultiplier: 1.85,
    enemySpeedMultiplier: 0.82,
    enemyTurnMultiplier: 0.85,
    enemyHealthMultiplier: 0.85,
    playerShieldRegenDelay: 3,
    playerHullRegen: 1.4,
    playerHullRegenDelay: 10,
    maxAliveEnemies: 6,
    waveEnemyGrowth: 1,
  },
  normal: {
    enemyDamageMultiplier: 0.7,
    enemyAccuracySpread: 0.045,
    enemyFireIntervalMultiplier: 1.35,
    enemySpeedMultiplier: 0.95,
    enemyTurnMultiplier: 0.95,
    enemyHealthMultiplier: 1,
    playerShieldRegenDelay: 4.5,
    playerHullRegen: 1,
    playerHullRegenDelay: 14,
    maxAliveEnemies: 7,
    waveEnemyGrowth: 1,
  },
  hard: {
    enemyDamageMultiplier: 1,
    enemyAccuracySpread: 0.025,
    enemyFireIntervalMultiplier: 1,
    enemySpeedMultiplier: 1.08,
    enemyTurnMultiplier: 1.05,
    enemyHealthMultiplier: 1.15,
    playerShieldRegenDelay: 6,
    playerHullRegen: 0.7,
    playerHullRegenDelay: 16,
    maxAliveEnemies: 8,
    waveEnemyGrowth: 1,
  },
};

export const DEFAULT_DIFFICULTY: Difficulty = 'easy';

export const ENEMY_TUNING = {
  /** Wave 1 always opens with exactly two enemies. */
  baseCount: 2,
  /** 4D: retuned for fully fitted hulls (was 90/30/8). */
  maxHealth: 170,
  maxShield: 40,
  shieldRegen: 4,
  shieldRegenDelay: 5,
  baseSpeed: 42,
  acceleration: 1.55,
  strafeFactor: 0.72,
  turnRate: 0.95,
  detectionRange: 950,
  disengageRange: 1700,
  aimGain: 2.7,
  orbitAngleRate: 0.2,
  burstOnMin: 1.15,
  burstOnMax: 1.55,
  burstOffMin: 1.9,
  burstOffMax: 3,
  fireInterval: 1,
  weaponDamage: 14,
  projectileSpeed: 360,
  projectileTtl: 5,
  maxFireRange: 620,
  fireConeDot: 0.985,
  radius: 4.8,
  respawnDelay: 10,
  respawnJitter: 4,
  /** Hard floor: enemies never appear closer than this to the player. */
  spawnMinDistance: 650,
  spawnPreferredMinDistance: 700,
  spawnMaxDistance: 980,
  /** Spawns are constrained to a forward cone so they arrive in view. */
  spawnConeDegrees: 38,
  spawnConePaddingDegrees: 6,
  spawnAttempts: 24,
  spawnDirectionLift: 0.09,
  spawnVerticalSpread: 85,
  spawnAsteroidClearance: 35,
  /** Flat lead applied by the AI's steering solution. */
  aiLeadMax: 0.65,
  aiLeadVelocityFactor: 0.72,
  /** Lead snapshot used when a telegraphed shot is locked in. */
  aimLeadMax: 0.9,
  aimVelocityFactor: 0.72,
  muzzleOffset: 1.2,
  initialFireCooldownMin: 0.8,
  initialFireCooldownMax: 1.6,
  fireCooldownJitterMin: 0.9,
  fireCooldownJitterMax: 1.15,
  warpDuration: 1.1,
  telegraphDuration: 0.7,
  extraSpawnInterval: 2.5,
} as const;

export const WAVE_TUNING = {
  killsPerWave: 4,
  enemiesPerWave: 1,
  maxEnemies: 8,
  healthPerWave: 0.16,
  speedPerWave: 0.035,
  /** Wave 1 raiders are deliberately sluggish while the player learns. */
  firstWaveSpeedScale: 0.85,
  damagePerWave: 0.06,
  fireIntervalPerWave: 0.03,
  spawnInterval: 2.5,
} as const;

/** World/level design numbers. Re-exported as WORLD_CONFIG for compatibility. */
export const WORLD_TUNING = {
  seed: 0x5eed1a3,
  asteroidCount: 240,
  fieldInnerRadius: 90,
  fieldOuterRadius: 6500,
  asteroidMinRadius: 7,
  asteroidMaxRadius: 34,
  asteroidMinYield: 6,
  asteroidMaxYield: 32,
  softBoundaryRadius: 26000,
  hardBoundaryRadius: 30000,
  respawnAsteroidDelay: 55,
  scorePerOre: 3,
  scorePerKill: 250,
  maxProjectiles: 160,
  maxAsteroidRespawnsPerSecond: 3,
} as const;

export const RESOURCE_SPAWN_WEIGHTS: readonly { kind: ResourceKind; weight: number }[] = [
  { kind: 'ferrite', weight: 0.4 },
  { kind: 'aurium', weight: 0.24 },
  { kind: 'cryonite', weight: 0.16 },
  { kind: 'magmarite', weight: 0.08 },
  { kind: 'hexite', weight: 0.07 },
  { kind: 'thryxium', weight: 0.05 },
];

export interface SimulationOptions {
  difficulty: Difficulty;
  /** Percentage of the hull's rated top speed, from the mobile speed slider. */
  speedScale: number;
  assistedFlight: boolean;
  aimAssist: boolean;
  /** Zone the simulation is running in; carried on mission events. */
  zoneId: string;
}

export const MAX_EVENTS = 320;

/**
 * Player preferences (not simulation rules) and their safe ranges. Stored in
 * localStorage by SettingsStore. Mobile starts slower and less sensitive.
 */
export interface UserSettings {
  difficulty: Difficulty;
  speedScale: number;
  sensitivity: number;
  aimAssist: boolean;
  assistedFlight: boolean;
  /** HUD scale multiplier, 80%–130%. */
  hudScale: number;
  /** HUD chrome opacity, 40%–100%. */
  hudOpacity: number;
  /** Show a small FPS/performance counter. */
  showFps: boolean;
}

export const SETTINGS_LIMITS = {
  speed: { min: 0.6, max: 1, step: 0.02, mobileDefault: 0.78, desktopDefault: 1 },
  sensitivity: { min: 0.5, max: 1.5, step: 0.05, mobileDefault: 0.8, desktopDefault: 1 },
  hudScale: { min: 0.8, max: 1.3, step: 0.05, default: 1 },
  hudOpacity: { min: 0.4, max: 1, step: 0.05, default: 1 },
} as const;

export const getDefaultSettings = (mobile: boolean): UserSettings => ({
  difficulty: DEFAULT_DIFFICULTY,
  speedScale: mobile ? SETTINGS_LIMITS.speed.mobileDefault : SETTINGS_LIMITS.speed.desktopDefault,
  sensitivity: mobile
    ? SETTINGS_LIMITS.sensitivity.mobileDefault
    : SETTINGS_LIMITS.sensitivity.desktopDefault,
  aimAssist: mobile,
  assistedFlight: mobile,
  hudScale: SETTINGS_LIMITS.hudScale.default,
  hudOpacity: SETTINGS_LIMITS.hudOpacity.default,
  showFps: false,
});
