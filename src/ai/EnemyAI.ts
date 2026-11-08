import { ENEMY_TUNING } from '../game/config';
import { clamp, forwardOf, qConjugate, qRotate, vec3Add, vec3Distance, vec3Dot, vec3Normalize, vec3Scale, vec3Sub, WORLD_UP } from '../game/math';
import type { AIState, ShipEntity } from '../game/types';
import type { Rng } from '../game/math';

export interface EnemyIntent {
  throttle: number;
  strafe: number;
  yaw: number;
  pitch: number;
  fire: boolean;
}

export const createAIState = (anchor: { x: number; y: number; z: number }, rng: Rng): AIState => {
  const waypoint = vec3Add(anchor, {
    x: rng.range(-420, 420),
    y: rng.range(-120, 160),
    z: rng.range(-420, 420),
  });
  return {
    mode: 'patrol',
    anchor: { ...anchor },
    waypoint,
    waypointTimer: rng.range(9, 15),
    orbitAngle: rng.range(0, Math.PI * 2),
    orbitDirection: rng.next() > 0.5 ? 1 : -1,
    burstTimer: rng.range(0.5, 2.5),
    fireAllowed: false,
  };
};

const steerTowards = (ship: ShipEntity, direction: { x: number; y: number; z: number }): { yaw: number; pitch: number } => {
  const local = qRotate(qConjugate(ship.quaternion), vec3Normalize(direction));
  const yawError = Math.atan2(-local.x, -local.z);
  const flat = Math.hypot(local.x, local.z);
  const pitchError = Math.atan2(local.y, Math.max(flat, 1e-5));
  const gain = ENEMY_TUNING.aimGain;
  return {
    yaw: clamp(-yawError * gain, -1, 1),
    pitch: clamp(pitchError * gain, -1, 1),
  };
};

const chooseWaypoint = (ai: AIState, rng: Rng): void => {
  ai.waypoint = {
    x: ai.anchor.x + rng.range(-520, 520),
    y: ai.anchor.y + rng.range(-150, 180),
    z: ai.anchor.z + rng.range(-520, 520),
  };
  ai.waypointTimer = rng.range(8, 14);
};

/**
 * Pure enemy brain. It returns control intent only — no rendering and no
 * scene graph access. The simulation applies the intent.
 */
export const updateEnemyAI = (
  ship: ShipEntity,
  player: ShipEntity,
  dt: number,
  rng: Rng,
): EnemyIntent => {
  const ai = ship.ai;
  if (!ai) {
    return { throttle: 0, strafe: 0, yaw: 0, pitch: 0, fire: false };
  }

  ai.waypointTimer -= dt;
  ai.burstTimer -= dt;
  ai.orbitAngle += dt * ENEMY_TUNING.orbitAngleRate * ai.orbitDirection;

  const playerDistance = vec3Distance(player.position, ship.position);
  const canSeePlayer = player.alive && playerDistance < ENEMY_TUNING.detectionRange;
  if (canSeePlayer) {
    ai.mode = 'engage';
  } else if (ai.mode === 'engage' && playerDistance > ENEMY_TUNING.disengageRange) {
    ai.mode = 'patrol';
  }

  if (ai.mode === 'patrol') {
    const distanceToWaypoint = vec3Distance(ship.position, ai.waypoint);
    if (distanceToWaypoint < 70 || ai.waypointTimer <= 0) {
      chooseWaypoint(ai, rng);
    }
    const dir = vec3Sub(ai.waypoint, ship.position);
    const steer = steerTowards(ship, dir);
    return {
      throttle: distanceToWaypoint > 90 ? 0.55 : 0.18,
      strafe: 0,
      yaw: steer.yaw,
      pitch: steer.pitch,
      fire: false,
    };
  }

  // Combat: nose stays on the player while lateral thrust creates an orbit.
  const lead = clamp(
    playerDistance / Math.max(ship.projectileSpeed, 1),
    0,
    ENEMY_TUNING.aiLeadMax,
  );
  const predicted = vec3Add(
    player.position,
    vec3Scale(player.velocity, lead * ENEMY_TUNING.aiLeadVelocityFactor),
  );
  const aimDirection = vec3Normalize(vec3Sub(predicted, ship.position));
  const forward = forwardOf(ship.quaternion);
  const aimDot = vec3Dot(forward, aimDirection);

  // Slight vertical breathing makes dogfights less mechanical.
  const vertical = Math.sin(ai.orbitAngle * 1.7) * clamp((playerDistance - 140) / 420, 0, 0.35);
  const aimWithLift = vec3Normalize(
    vec3Add(aimDirection, vec3Scale(WORLD_UP, vertical * 0.18)),
  );

  const steer = steerTowards(ship, aimWithLift);

  if (ai.burstTimer <= 0) {
    ai.fireAllowed = !ai.fireAllowed;
    ai.burstTimer = ai.fireAllowed
      ? ENEMY_TUNING.burstOnMin +
        rng.range(0, ENEMY_TUNING.burstOnMax - ENEMY_TUNING.burstOnMin)
      : ENEMY_TUNING.burstOffMin +
        rng.range(0, ENEMY_TUNING.burstOffMax - ENEMY_TUNING.burstOffMin);
  }

  const orbitSpeed = playerDistance > 120 && playerDistance < 380 ? 0.82 : 0.18;
  const throttle =
    playerDistance > 420
      ? 1
      : playerDistance > 270
        ? 0.72
        : playerDistance < 110
          ? -0.38
          : 0.26;

  return {
    throttle,
    strafe: ai.orbitDirection * orbitSpeed,
    yaw: steer.yaw,
    pitch: steer.pitch,
    fire:
      ai.fireAllowed &&
      aimDot > ENEMY_TUNING.fireConeDot &&
      playerDistance < ENEMY_TUNING.maxFireRange,
  };
};
