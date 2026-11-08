import {
  acceptMissionOffer,
  claimMission as claimMissionReward,
  type MissionOffer,
} from './missions';
import { HOME_STATION_ID } from './worldData';
import { isKnownZone } from './missions';

export type { MissionOffer };

/**
 * 4D-fix round 2: single source of truth for the profile-level mission flow.
 * main.ts and the headless tests call EXACTLY these functions, so the same
 * code path the market UI button triggers is what the tests execute.
 * All functions are pure (no DOM / Three.js) and return patches to persist.
 */

export interface MissionFlowInput {
  missions: MissionOffer[];
  missionBoard: MissionOffer[];
  missionId: string;
  /** Zone the mission counts in (mine/destroy only). */
  zoneId: string;
  now: number;
  maxActive: number;
}

/** Fields of `MissionOffer` that are normalized after loading from a save. */
export function normalizeMissionRecord(
  mission: MissionOffer,
  zoneId: string,
  now: number,
): MissionOffer {
  const completed = mission.current >= mission.amount;
  const isDeliver = mission.type === 'deliver';
  return {
    ...mission,
    amount: Math.max(1, Math.round(mission.amount)),
    current: Math.max(0, Number.isFinite(mission.current) ? Math.round(mission.current) : 0),
    completed,
    zoneId: isDeliver
      ? undefined
      : isKnownZone(mission.zoneId)
        ? mission.zoneId
        : zoneId,
    stationId: isDeliver ? (mission.stationId ?? HOME_STATION_ID) : undefined,
    acceptedAt: mission.accepted ? (mission.acceptedAt ?? now) : mission.acceptedAt,
  };
}

/** Accept one board offer. Returns `null` when the action is not allowed. */
export function acceptOfferAction(input: MissionFlowInput): {
  missions: MissionOffer[];
  missionBoard: MissionOffer[];
} | null {
  const { missions, missionBoard, missionId, zoneId, now, maxActive } = input;
  const active = missions.filter((m) => m.accepted && !m.completed);
  if (active.length >= maxActive) return null;
  const offer = missionBoard.find((m) => m.id === missionId);
  if (!offer || offer.accepted || offer.completed) return null;
  const mission = normalizeMissionRecord(acceptMissionOffer(offer), zoneId, now);
  return {
    missions: [...missions.filter((m) => m.id !== missionId), mission],
    missionBoard: missionBoard.map((m) => (m.id === missionId ? { ...m, accepted: true } : m)),
  };
}

/** Abandon (removes from the active list and the board). */
export function abandonAction(
  input: { missions: MissionOffer[]; missionBoard: MissionOffer[]; missionId: string },
): { missions: MissionOffer[]; missionBoard: MissionOffer[] } {
  const { missions, missionBoard, missionId } = input;
  return {
    missions: missions.filter((m) => m.id !== missionId),
    missionBoard: missionBoard.filter((m) => m.id !== missionId),
  };
}

export interface ClaimActionInput {
  missions: MissionOffer[];
  missionBoard: MissionOffer[];
  missionId: string;
  credits: number;
  ownedModules: Record<string, number>;
  score: number;
}

export interface ClaimActionResult {
  credits: number;
  ownedModules: Record<string, number>;
  score: number;
  missions: MissionOffer[];
  missionBoard: MissionOffer[];
  creditsGained: number;
  moduleId?: string;
}

/**
 * Claim reward: credits the balance (and module reward) exactly once and
 * removes the mission. Returns null when the mission is not claimable.
 */
export function claimAction(input: ClaimActionInput): ClaimActionResult | null {
  const claim = claimMissionReward(input.missions, input.missionId);
  if (!claim) return null;
  const ownedModules = { ...input.ownedModules };
  if (claim.moduleId) {
    ownedModules[claim.moduleId] = (ownedModules[claim.moduleId] ?? 0) + 1;
  }
  return {
    credits: input.credits + claim.credits,
    ownedModules,
    score: input.score + claim.credits,
    missions: claim.missions,
    missionBoard: input.missionBoard.filter((m) => m.id !== claim.mission.id),
    creditsGained: claim.credits,
    moduleId: claim.moduleId,
  };
}

export interface DeliverActionInput {
  missions: MissionOffer[];
  /** Live simulation cargo hold. */
  cargoResources: Record<string, number>;
  cargoUsed: number;
  cargoCapacity: number;
  /** Station storage, moved rows are credited in to station storage. */
  stationStorage: Record<string, number>;
}

export interface DeliverActionResult {
  missions: MissionOffer[];
  cargoResources: Record<string, number>;
  cargoUsed: number;
  stationStorage: Record<string, number>;
  events: Array<{
    type: 'delivered';
    resourceId: string;
    amount: number;
    stationId: string;
  }>;
}

/** Hand accepted deliver missions in at the station (cargo first, then storage). */
export function deliverMissionsAction(input: DeliverActionInput): DeliverActionResult {
  const cargoResources = { ...input.cargoResources };
  const stationStorage = { ...input.stationStorage };
  let cargoUsed = input.cargoUsed;
  const events: DeliverActionResult['events'] = [];
  let missions = [...input.missions];
  // Re-run until nothing more can be handed in (bounded by mission count).
  for (let guard = 0; guard < 8; guard += 1) {
    const mission = missions.find(
      (m) => m.accepted && !m.completed && m.type === 'deliver',
    );
    if (!mission) break;
    const kind = mission.target;
    const need = Math.max(0, mission.amount - mission.current);
    const cargoHave = Math.floor(cargoResources[kind] ?? 0);
    const takeCargo = Math.min(need, cargoHave);
    const storeHave = Math.floor(stationStorage[kind] ?? 0);
    const takeStorage = Math.min(need - takeCargo, storeHave);
    const taken = takeCargo + takeStorage;
    if (taken <= 0) break;
    if (takeCargo > 0) {
      cargoResources[kind] = cargoHave - takeCargo;
      cargoUsed = Math.max(0, cargoUsed - takeCargo);
    }
    if (takeStorage > 0) {
      stationStorage[kind] = storeHave - takeStorage;
    }
    missions = missions.map((m) => (m.id === mission.id ? { ...m, current: m.current + taken } : m));
    events.push({ type: 'delivered', resourceId: kind, amount: taken, stationId: HOME_STATION_ID });
  }
  return { missions, cargoResources, cargoUsed, stationStorage, events };
}

/** Kept for save repair parity with ProfileStore.normalizeSavedMission. */
export { claimMissionReward };
