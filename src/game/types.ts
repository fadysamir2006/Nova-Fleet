import type { Quat, Vec3 } from './math';

export type { Quat, Vec3 } from './math';

export type Team = 'player' | 'enemy';

export type ResourceKind =
  | 'ferrite'
  | 'aurium'
  | 'cryonite'
  | 'magmarite'
  | 'hexite'
  | 'thryxium'
  | 'nanocarbon'
  | 'isotopes'
  | 'alloys';

export type PlanetType = 'terran' | 'volcanic' | 'gasgiant' | 'ice' | 'barren';

export type SlotType = 'high' | 'mid' | 'low';

export type ModuleType =
  | 'weapon'
  | 'miner'
  | 'repair'
  | 'shield'
  | 'propulsion'
  | 'scanner'
  | 'armor'
  | 'reactor'
  | 'cargo';

export type ColonyBuildingType =
  | 'command'
  | 'extractor'
  | 'refinery'
  | 'shipyard'
  | 'barracks'
  | 'rnd';
export type GameStatus = 'running' | 'destroyed';
export type LocalizedText = { en: string; ar: string };

export interface PlayerInput {
  /** -1 (reverse) .. 1 (full forward) */
  throttle: number;
  /** -1 (left) .. 1 (right) */
  strafe: number;
  /** -1 (left) .. 1 (right) */
  yaw: number;
  /** -1 (nose down) .. 1 (nose up) */
  pitch: number;
  fire: boolean;
  mine: boolean;
  boost: boolean;
}

export const createEmptyInput = (): PlayerInput => ({
  throttle: 0,
  strafe: 0,
  yaw: 0,
  pitch: 0,
  fire: false,
  mine: false,
  boost: false,
});

export interface AIState {
  mode: 'patrol' | 'engage';
  anchor: Vec3;
  waypoint: Vec3;
  waypointTimer: number;
  orbitAngle: number;
  orbitDirection: number;
  burstTimer: number;
  fireAllowed: boolean;
}

export interface ShipEntity {
  id: number;
  team: Team;
  modelId: string;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  quaternion: Quat;
  bank: number;
  radius: number;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  shieldRegenTimer: number;
  hullRegenTimer: number;
  alive: boolean;
  respawnTimer: number;
  hitFlash: number;
  /** > 0 while the ship is materializing from warp; treated as protected. */
  warpTimer: number;
  fireCooldown: number;
  /** Wind-up before an enemy shot; drives the aim-line telegraph. */
  chargeTimer: number;
  chargeTarget: Vec3 | null;
  fireInterval: number;
  weaponDamage: number;
  projectileSpeed: number;
  baseSpeed: number;
  turnRate: number;
  boost: number;
  boostLockTimer: number;
  boosting: boolean;
  ai: AIState | null;
}

export interface Projectile {
  id: number;
  team: Team;
  position: Vec3;
  previousPosition: Vec3;
  /** Muzzle point, used for the incoming-damage direction indicator. */
  origin: Vec3;
  velocity: Vec3;
  damage: number;
  ttl: number;
  active: boolean;
}

export interface AsteroidEntity {
  id: number;
  position: Vec3;
  quaternion: Quat;
  spinAxis: Vec3;
  spinSpeed: number;
  radius: number;
  maxYield: number;
  yieldRemaining: number;
  resource: ResourceKind;
  alive: boolean;
  respawnTimer: number;
}

export interface OrePickup {
  id: number;
  resource: ResourceKind;
  amount: number;
  position: Vec3;
  velocity: Vec3;
  ttl: number;
  active: boolean;
}

export interface CargoHold {
  capacity: number;
  used: number;
  resources: Record<ResourceKind, number>;
}

export interface PlanetDef {
  id: string;
  name: LocalizedText;
  type: PlanetType;
  orbitIndex: number;
  uniqueResource: ResourceKind;
  description: LocalizedText;
  radius: number;
  orbitRadius: number;
  orbitSpeed: number;
}

export interface SolarSystem {
  id: string;
  name: LocalizedText;
  starName: LocalizedText;
  planets: PlanetDef[];
}

export interface ColonyBuilding {
  type: ColonyBuildingType;
  level: number;
  buildProgress?: number;
}

export interface Colony {
  id: string;
  planetId: string;
  name: string;
  buildings: ColonyBuilding[];
  stored: Record<ResourceKind, number>;
  lastTick: number;
  credits: number;
  crew: number;
  techLevel: number;
}

export interface MarketOrder {
  resource: ResourceKind;
  buy: number;
  sell: number;
}

export interface EconomyState {
  credits: number;
  colonies: Colony[];
  market: MarketOrder[];
  refineryOutput: Record<string, number>;
}

export interface MiningState {
  targetId: number | null;
  active: boolean;
  range: number;
}

export interface ModuleDefinition {
  id: string;
  name: LocalizedText;
  type: ModuleType;
  slot: SlotType;
  cpu: number;
  powergrid: number;
  description: LocalizedText;
  effects: Record<string, number>;
}

export interface FittedModule {
  moduleId: string;
  slotIndex: number;
}

export interface PlayerLoadout {
  id: string;
  modelId: string;
  maxHealth: number;
  maxShield: number;
  shieldRegen: number;
  shieldRegenDelay: number;
  baseSpeed: number;
  boostMultiplier: number;
  boostCapacity: number;
  boostDrain: number;
  boostRegen: number;
  turnRate: number;
  fireInterval: number;
  weaponDamage: number;
  projectileSpeed: number;
  miningRate: number;
  miningRange: number;
  cargoCapacity: number;
  radius: number;
  cpuCapacity: number;
  powergridCapacity: number;
  highSlots: number;
  midSlots: number;
  lowSlots: number;
  modules: FittedModule[];
}

export type GameEvent =
  | {
      type: 'weapon-fired';
      team: Team;
      position: Vec3;
      direction: Vec3;
    }
  | {
      type: 'ship-hit';
      shipId: number;
      team: Team;
      position: Vec3;
      source: Vec3;
      damage: number;
      shieldAbsorbed: boolean;
    }
  | {
      type: 'ship-destroyed';
      shipId: number;
      team: Team;
      position: Vec3;
    }
  | {
      type: 'asteroid-hit';
      asteroidId: number;
      position: Vec3;
      resource: ResourceKind;
    }
  | {
      type: 'asteroid-depleted';
      asteroidId: number;
      position: Vec3;
      resource: ResourceKind;
    }
  | {
      type: 'ore-collected';
      resource: ResourceKind;
      amount: number;
      total: number;
    }
  | {
      /** 4D-fix: one mission-facing event per unit gained (mining or pickup). */
      type: 'mined';
      resourceId: ResourceKind;
      amount: number;
      zoneId: string;
      source: 'mining' | 'pickup' | 'loot' | 'refinery';
    }
  | {
      /** 4D-fix: mission-facing hostile kill event. */
      type: 'killed';
      enemyId: number;
      zoneId: string;
    }
  | {
      type: 'cargo-full';
      position: Vec3;
    }
  | {
      type: 'player-destroyed';
      position: Vec3;
    }
  | {
      type: 'boundary-warning';
      active: boolean;
    }
  | {
      type: 'lock-changed';
      targetId: number | null;
    }
  | {
      type: 'enemy-spawned';
      shipId: number;
      position: Vec3;
      warpDuration: number;
    }
  | {
      type: 'enemy-aiming';
      shipId: number;
      position: Vec3;
      target: Vec3;
      duration: number;
    }
  | {
      type: 'target-changed';
      targetId: number | null;
    }
  | {
      type: 'grace-ended';
    };

export interface RadarContact {
  x: number;
  y: number;
  kind: 'enemy' | 'asteroid';
  size: number;
}

export interface SimulationSnapshot {
  status: GameStatus;
  score: number;
  kills: number;
  elapsed: number;
  cargo: CargoHold;
  mining: MiningState;
  player: ShipEntity;
  enemies: readonly ShipEntity[];
  asteroids: readonly AsteroidEntity[];
  projectiles: readonly Projectile[];
  boundaryWarning: boolean;
  wave: number;
  graceRemaining: number;
  targetEnemyId: number | null;
}
