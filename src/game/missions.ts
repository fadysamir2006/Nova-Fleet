import { MISSION_EVENT_RULES, MISSION_TUNING } from './config';
import { HOME_STATION_ID, ZONES } from './worldData';
import { MODULE_DEFINITIONS } from './fitting';
import type { ResourceKind } from './types';

/**
 * 4D station mission board. Pure data only (no DOM / Three.js) so the same
 * rules can run on the future authoritative server.
 *
 * Progress is event-based: the game loop (and unit tests) call
 * `applyMissionEvent` with `mined` / `killed` / `delivered` events. Progress is
 * never read back from cargo, so moving ore to storage or selling it cannot
 * change a mission.
 */
export type MissionType = 'mine' | 'destroy' | 'deliver';

export interface MissionOffer {
  id: string;
  type: MissionType;
  target: string;
  amount: number;
  current: number;
  /** Target reached; waiting for the player to claim the reward. */
  completed: boolean;
  reward: number;
  accepted: boolean;
  moduleReward?: string;
  /** Zone where mine/destroy progress counts (board zone). */
  zoneId?: string;
  /** Station where deliver missions are handed in. */
  stationId?: string;
  danger?: number;
  /** When the player accepted it (progress only counts from here). */
  acceptedAt?: number;
}

export const MISSION_BOARD_REFRESH_MS = MISSION_TUNING.refreshMs;
export const MISSION_BOARD_MIN = MISSION_TUNING.minOffers;
export const MISSION_BOARD_MAX = MISSION_TUNING.maxOffers;

interface Rng {
  next(): number;
}

function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    },
  };
}

function zoneHash(zoneId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < zoneId.length; i += 1) {
    hash ^= zoneId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng.next() * list.length) % list.length];
}

function moduleRewardFor(danger: number, rng: Rng): string | undefined {
  if (rng.next() > MISSION_TUNING.moduleRewardChance) return undefined;
  const affordable = MODULE_DEFINITIONS.filter(
    (mod) =>
      mod.creditCost <=
      MISSION_TUNING.moduleRewardCostBase + danger * MISSION_TUNING.moduleRewardCostPerDanger,
  );
  if (affordable.length === 0) return undefined;
  return pick(rng, affordable).id;
}

export function isKnownZone(zoneId: string | undefined): boolean {
  if (!zoneId) return false;
  return ZONES.some((zone) => zone.id === zoneId);
}

/**
 * Generates 3-5 offers scaled by the zone danger level. The board is stable
 * for a given zone + refresh timestamp because the seed is derived from both.
 */
export function generateMissionBoard(
  zoneId: string,
  refreshedAt: number,
  count?: number,
): MissionOffer[] {
  const zone = ZONES.find((z) => z.id === zoneId);
  const danger = zone?.dangerLevel ?? 1;
  const rng = createRng(zoneHash(zoneId) ^ Math.floor(refreshedAt / MISSION_BOARD_REFRESH_MS));
  const total = Math.max(
    MISSION_BOARD_MIN,
    Math.min(MISSION_BOARD_MAX, count ?? MISSION_BOARD_MIN + Math.floor(rng.next() * 3)),
  );
  const resources: ResourceKind[] =
    zone && zone.uniqueResources.length > 0
      ? [...zone.uniqueResources]
      : ['ferrite', 'aurium'];
  const types: MissionType[] = ['mine', 'destroy', 'deliver'];

  const offers: MissionOffer[] = [];
  for (let i = 0; i < total; i += 1) {
    const type = types[i % types.length];
    const resource = pick(rng, resources);
    let amount: number;
    let reward: number;
    let target = resource as string;
    if (type === 'mine') {
      const t = MISSION_TUNING.mine;
      amount = Math.round(t.amountBase + danger * t.amountPerDanger + rng.next() * t.amountRandom);
      reward = Math.round(t.base * danger + amount * t.perUnit);
    } else if (type === 'destroy') {
      const t = MISSION_TUNING.destroy;
      amount = Math.round(t.amountBase + danger * t.amountPerDanger + rng.next() * t.amountRandom);
      reward = Math.round(t.base * danger + amount * t.perKill);
      target = 'hostiles';
    } else {
      const t = MISSION_TUNING.deliver;
      amount = Math.round(t.amountBase + danger * t.amountPerDanger + rng.next() * t.amountRandom);
      reward = Math.round(t.base * danger + amount * t.perUnit);
    }
    offers.push({
      id: `mission-${zoneId}-${refreshedAt}-${i}`,
      type,
      target,
      amount,
      current: 0,
      completed: false,
      reward,
      accepted: false,
      moduleReward: moduleRewardFor(danger, rng),
      // Deliver missions are handed in at the station, not gated by flight zone.
      zoneId: type === 'deliver' ? undefined : zoneId,
      stationId: type === 'deliver' ? HOME_STATION_ID : undefined,
      danger,
    });
  }
  return offers;
}

/**
 * Accepting an offer resets its progress; events count from `acceptedAt`
 * onward because only accepted missions ever receive progress.
 */
export function acceptMissionOffer(offer: MissionOffer, at = Date.now()): MissionOffer {
  return {
    ...offer,
    accepted: true,
    acceptedAt: at,
    current: 0,
    completed: false,
  };
}

export type MissionEventSource = 'mining' | 'pickup' | 'loot' | 'refinery';

/** The single event shape the game loop and unit tests both feed in. */
export interface MissionGameEvent {
  type: 'mined' | 'killed' | 'delivered';
  resourceId?: string;
  amount?: number;
  zoneId?: string;
  enemyId?: string | number;
  stationId?: string;
  source?: MissionEventSource;
}

function sourceCounts(source: MissionEventSource | undefined): boolean {
  if (source === 'refinery') return MISSION_EVENT_RULES.countRefinery;
  if (source === 'pickup' || source === 'loot') return MISSION_EVENT_RULES.countPickups;
  return true;
}

function zoneMatches(mission: MissionOffer, event: MissionGameEvent): boolean {
  if (!MISSION_EVENT_RULES.enforceZone) return true;
  // An unknown/legacy zone id never blocks progress; only a real mismatch does.
  if (!mission.zoneId || !isKnownZone(mission.zoneId) || !event.zoneId) return true;
  return mission.zoneId === event.zoneId;
}

export function missionEventMatches(mission: MissionOffer, event: MissionGameEvent): boolean {
  if (!mission.accepted || mission.completed) return false;
  if (event.type === 'mined') {
    return (
      mission.type === 'mine' &&
      mission.target === event.resourceId &&
      sourceCounts(event.source) &&
      zoneMatches(mission, event)
    );
  }
  if (event.type === 'killed') {
    return mission.type === 'destroy' && zoneMatches(mission, event);
  }
  if (event.type === 'delivered') {
    if (mission.type !== 'deliver') return false;
    if (mission.target !== event.resourceId) return false;
    if (mission.stationId && event.stationId && mission.stationId !== event.stationId) return false;
    if (MISSION_EVENT_RULES.deliverAtStationOnly && !event.stationId) return false;
    return true;
  }
  return false;
}

/**
 * Applies one gameplay event to accepted missions. Only missions matching the
 * resource/zone/station gain progress, and only by the amount the event
 * carries, so progress is counted from the moment of acceptance. Returns the
 * same array reference when nothing changed.
 */
export function applyMissionEvent(
  missions: MissionOffer[],
  event: MissionGameEvent,
): MissionOffer[] {
  const fallback = event.type === 'killed' ? 1 : 0;
  const rawAmount = Math.max(0, Number.isFinite(event.amount) ? (event.amount ?? fallback) : fallback);
  if (rawAmount <= 0) return missions;
  let changed = false;
  const next = missions.map((mission) => {
    if (!missionEventMatches(mission, event)) return mission;
    const current = Math.min(mission.amount, mission.current + rawAmount);
    if (current === mission.current && mission.completed) return mission;
    changed = true;
    return { ...mission, current, completed: current >= mission.amount };
  });
  return changed ? next : missions;
}

/** Missions whose target is reached and whose reward is not claimed yet. */
export function completedMissions(missions: MissionOffer[]): MissionOffer[] {
  return missions.filter((mission) => mission.accepted && mission.completed);
}

export function missionRewardCredits(mission: MissionOffer): number {
  return Math.max(0, Math.round(mission.reward));
}

export interface MissionClaim {
  mission: MissionOffer;
  credits: number;
  moduleId?: string;
  /** Mission list with the claimed entry removed. */
  missions: MissionOffer[];
}

/**
 * Claims a completed mission. Rewards are only computed here; callers add
 * `credits` to the pilot balance / `moduleId` to the inventory and persist
 * `missions`.
 */
export function claimMission(missions: MissionOffer[], missionId: string): MissionClaim | null {
  const mission = missions.find((entry) => entry.id === missionId && missionIsReady(entry));
  if (!mission) return null;
  return {
    mission,
    credits: missionRewardCredits(mission),
    moduleId: mission.moduleReward,
    missions: missions.filter((entry) => entry.id !== missionId),
  };
}

/* ------------------------------------------------------------------------- */
/* Shared label formatting (used by the HUD tracker and the station board)    */
/* ------------------------------------------------------------------------- */

export const MISSION_TEXT_KEYS = {
  mine: 'mission.mine',
  destroy: 'mission.destroy',
  deliver: 'mission.deliver',
} as const;

export interface MissionTextContext {
  t(key: string, params?: Record<string, string | number>): string;
  resourceName(id: string): string;
  zoneName(id: string | undefined): string;
  stationName(id: string | undefined): string;
}

/**
 * Every placeholder a mission template needs. Callers pass this straight to
 * i18n; the unit test asserts no value is empty for any mission zone.
 */
export function missionTextParams(
  mission: MissionOffer,
  ctx: MissionTextContext,
): Record<string, string | number> {
  if (mission.type === 'mine') {
    return { amount: mission.amount, resource: ctx.resourceName(mission.target) };
  }
  if (mission.type === 'destroy') {
    return { amount: mission.amount, zone: ctx.zoneName(mission.zoneId) };
  }
  return {
    amount: mission.amount,
    resource: ctx.resourceName(mission.target),
    station: ctx.stationName(mission.stationId),
  };
}

export function missionLabel(mission: MissionOffer, ctx: MissionTextContext): string {
  return ctx.t(MISSION_TEXT_KEYS[mission.type], missionTextParams(mission, ctx));
}

/** Short "what do I do" line shown under the title. */
export function missionTargetLabel(mission: MissionOffer, ctx: MissionTextContext): string {
  if (mission.type === 'mine') return ctx.resourceName(mission.target);
  if (mission.type === 'destroy') return ctx.zoneName(mission.zoneId);
  return `${ctx.resourceName(mission.target)} · ${ctx.stationName(mission.stationId)}`;
}

export function missionIsReady(mission: MissionOffer): boolean {
  return mission.accepted && mission.completed;
}
