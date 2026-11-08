import type { ResourceKind, SlotType } from '../game/types';
import {
  STARTER_OWNED_MODULE_COUNTS,
  normalizeOwnedModules,
  getModuleById,
  calculateCpuUsed,
  calculatePowerUsed,
  type OwnedModuleCounts,
} from '../game/fitting';
import { STARTING_CREDITS, buildPlayerLoadout } from '../game/config';
import { HOME_STATION_ID } from '../game/worldData';
import { isKnownZone } from '../game/missions';

export interface MissionProgress {
  id: string;
  type: 'mine' | 'destroy' | 'deliver';
  target: string;
  amount: number;
  current: number;
  completed: boolean;
  reward: number;
  accepted: boolean;
  /** Optional module reward (4D). */
  moduleReward?: string;
  /** Zone where the mission should be completed (4D). */
  zoneId?: string;
  /** Station where deliver missions are handed in (4D-fix). */
  stationId?: string;
  /** Danger level used to scale rewards (4D). */
  danger?: number;
  /** 4D-fix: progress only counts from this timestamp. */
  acceptedAt?: number;
}

export interface RefineryJob {
  id: string;
  recipeId: string;
  amount: number;
  startTime: number;
  finishTime: number;
  completed: boolean;
}

export interface ColonyPlotState {
  id: number;
  building?: import('../game/types').ColonyBuildingType;
  level: number;
  startedAt?: number;
  endsAt?: number;
}

export interface PilotProfile {
  id: string;
  name: string;
  shipId: string;
  difficulty: string;
  credits: number;
  /** Set once when STARTING_CREDITS is granted; prevents double-grant on migration. */
  startingCreditsGranted?: boolean;
  score: number;
  kills: number;
  oreCollected: number;
  updatedAt: number;
  version?: number;
  fittedModules?: Record<string, Array<{ moduleId: string; slotIndex: number }>>;
  /** 4D: moduleId -> quantity owned. Migrated from string[] saves. */
  ownedModules?: OwnedModuleCounts;
  loadouts?: Record<string, Array<{ name: string; modules: Array<{ moduleId: string; slotIndex: number }> }>>;
  /** Zone ID selected for the next launch from menu/hangar. */
  startingZone?: string;
  visitedZones?: string[];
  discoveredResources?: ResourceKind[];
  missions?: MissionProgress[];
  /** 4D: current station mission board offers (3-5). */
  missionBoard?: MissionProgress[];
  /** 4D: when the board was generated (ms). */
  missionBoardRefreshedAt?: number;
  stationStorage?: Record<ResourceKind, number>;
  refineryQueue?: RefineryJob[];
  marketPrices?: Record<ResourceKind, { buy: number; sell: number; trend: number }>;
  colonyPlots?: ColonyPlotState[];
} 

const KEY = 'nova-fleet-profiles';
const ACTIVE = 'nova-fleet-active-profile';
const VERSION = 8;

/**
 * 4D-fix: repair mission records written by earlier builds (missing zone or
 * station, stale progress). Without a valid zone the HUD/board used to print
 * "Destroy 5 enemies in <blank>" and progress could be gated out forever.
 */
function normalizeSavedMission(mission: MissionProgress, zoneId: string): MissionProgress {
  const amount = Math.max(1, Math.round(Number(mission.amount) || 1));
  const current = Math.min(amount, Math.max(0, Number(mission.current) || 0));
  const isDeliver = mission.type === 'deliver';
  return {
    ...mission,
    amount,
    current,
    completed: current >= amount,
    accepted: Boolean(mission.accepted),
    zoneId: isDeliver
      ? undefined
      : mission.zoneId && isKnownZone(mission.zoneId)
        ? mission.zoneId
        : zoneId,
    stationId: isDeliver ? mission.stationId ?? HOME_STATION_ID : undefined,
    acceptedAt: mission.accepted ? mission.acceptedAt ?? Date.now() : mission.acceptedAt,
  };
}

const SHIP_SLOTS: Record<string, { high: number; mid: number; low: number }> = {
  helix: { high: 2, mid: 4, low: 3 },
  ironharrow: { high: 5, mid: 3, low: 3 },
  deepmaw: { high: 3, mid: 3, low: 4 },
  // legacy/aliases
  skylance: { high: 2, mid: 4, low: 3 },
  ironwake: { high: 5, mid: 3, low: 3 },
};

export class ProfileStore {
  private profiles: PilotProfile[] = [];

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        this.profiles = JSON.parse(raw);
        this.migrate();
      }
    } catch {
      this.profiles = [];
    }
  }

  private migrate(): void {
    let changed = false;
    for (const p of this.profiles) {
      const needs = !p.version || p.version < VERSION;
      const isV7 = !p.version || p.version < 7;
      if (!p.fittedModules) { p.fittedModules = {}; changed = true; }
      // v7 (4D): owned modules become moduleId -> quantity; legacy ids become quantity 1.
      const ownedBefore = JSON.stringify(p.ownedModules);
      const counts = normalizeOwnedModules(p.ownedModules as unknown as string[] | OwnedModuleCounts);
      // Fitted modules count as owned (never lose fitted copies on migration).
      // Count copies across every hull: the same weapon may be fitted 5 times
      // on one hull, and each of those copies must become quantity.
      const fittedCounts: OwnedModuleCounts = {};
      for (const fitted of Object.values(p.fittedModules ?? {})) {
        for (const m of fitted) {
          fittedCounts[m.moduleId] = (fittedCounts[m.moduleId] ?? 0) + 1;
        }
      }
      for (const [moduleId, fittedQty] of Object.entries(fittedCounts)) {
        counts[moduleId] = Math.max(counts[moduleId] ?? 0, fittedQty);
      }
      // Starter top-up so every hull slot can be tested with full loadouts (only on v7 migration).
      if (isV7) {
        for (const [id, qty] of Object.entries(STARTER_OWNED_MODULE_COUNTS)) {
          counts[id] = Math.max(counts[id] ?? 0, qty);
        }
      }
      p.ownedModules = counts;
      if (JSON.stringify(p.ownedModules) !== ownedBefore) changed = true;
      if (!p.loadouts) { p.loadouts = {}; changed = true; }
      if (!p.visitedZones) { p.visitedZones = ['nova-prime']; changed = true; }
      if (!p.startingZone) { p.startingZone = 'nova-prime'; changed = true; }
      if (!p.discoveredResources) { p.discoveredResources = ['ferrite']; changed = true; }
      if (!p.missions) { p.missions = []; changed = true; }
      if (!p.missionBoard) { p.missionBoard = []; changed = true; }
      if (typeof p.missionBoardRefreshedAt !== 'number') { p.missionBoardRefreshedAt = 0; changed = true; }
      if (!p.stationStorage) { p.stationStorage = {} as Record<ResourceKind, number>; changed = true; }
      if (!p.refineryQueue) { p.refineryQueue = []; changed = true; }
      if (!p.marketPrices) { p.marketPrices = {} as Record<ResourceKind, { buy: number; sell: number; trend: number }>; changed = true; }
      if (!p.colonyPlots) { p.colonyPlots = Array.from({ length: 6 }, (_, i) => ({ id: i, level: 0 })); changed = true; }
      if (typeof p.credits !== 'number') { p.credits = STARTING_CREDITS; changed = true; }
      // v8 (4D-fix): make saved mission records addressable (zone/station) and
      // recompute claimable state instead of relying on old auto-complete flags.
      if (!p.version || p.version < 8) {
        const missionZone = p.startingZone && isKnownZone(p.startingZone) ? p.startingZone : 'nova-prime';
        p.missions = (p.missions ?? []).map((m) => normalizeSavedMission(m, missionZone));
        p.missionBoard = (p.missionBoard ?? []).map((m) => normalizeSavedMission(m, missionZone));
        changed = true;
      }
      // v5: clamp fitted modules to new slot counts (extras moved to owned, never deleted).
      if (!p.version || p.version < 5) {
        this.migrateFitsToNewSlots(p);
        changed = true;
      }
      // v6: grant STARTING_CREDITS once to existing saves whose credits are below it.
      if (!p.startingCreditsGranted) {
        if ((p.credits ?? 0) < STARTING_CREDITS) {
          p.credits = STARTING_CREDITS;
        }
        p.startingCreditsGranted = true;
        changed = true;
      }
      if (needs) { p.version = VERSION; changed = true; }
    }
    if (changed) this.save();
  }

  /** Move modules that no longer fit (slot count/CPU/power after slot reduction) back to owned inventory. Never delete. */
  private migrateFitsToNewSlots(p: PilotProfile): void {
    if (!p.fittedModules) return;
    const owned = normalizeOwnedModules(p.ownedModules as unknown as string[] | OwnedModuleCounts);
    for (const shipId of Object.keys(p.fittedModules)) {
      const slots = SHIP_SLOTS[shipId] ?? SHIP_SLOTS.helix;
      const fitted = [...(p.fittedModules[shipId] ?? [])];
      // Keep valid slot indices per type; if too many for a type, move extras (highest indices) to owned.
      const byType: Record<'high'|'mid'|'low', Array<{ moduleId: string; slotIndex: number }>> = { high: [], mid: [], low: [] };
      const overflow: Array<{ moduleId: string; slotIndex: number }> = [];
      for (const m of fitted) {
        const def = getModuleById(m.moduleId);
        if (!def) { overflow.push(m); continue; }
        const t = def.slot as 'high'|'mid'|'low';
        const max = slots[t];
        if (m.slotIndex < 0 || m.slotIndex >= max) { overflow.push(m); continue; }
        byType[t].push(m);
      }
      for (const t of ['high','mid','low'] as const) {
        const max = slots[t];
        byType[t].sort((a,b) => a.slotIndex - b.slotIndex);
        // remove duplicate slot indices (keep first)
        const seen = new Set<number>();
        byType[t] = byType[t].filter(x => (seen.has(x.slotIndex) ? (overflow.push(x), false) : (seen.add(x.slotIndex), true)));
        while (byType[t].length > max) overflow.push(byType[t].pop()!);
      }
      const kept = [...byType.high, ...byType.mid, ...byType.low];
      // Clamp CPU/power: build a temp loadout with new capacities and unfitting until valid.
      const base = buildPlayerLoadout(shipId === 'skylance' ? 'helix' : shipId === 'ironwake' ? 'ironharrow' : shipId, shipId);
      base.highSlots = slots.high; base.midSlots = slots.mid; base.lowSlots = slots.low;
      const toMod = (m: { moduleId: string; slotIndex: number }) => ({ moduleId: m.moduleId, slotIndex: m.slotIndex, slot: (getModuleById(m.moduleId)?.slot ?? 'high') as SlotType });
      base.modules = kept.map(toMod);
      while (kept.length > 0 && (calculateCpuUsed(base) > base.cpuCapacity || calculatePowerUsed(base) > base.powergridCapacity)) {
        overflow.push(kept.pop()!);
        base.modules = kept.map(toMod);
      }
      for (const m of overflow) owned[m.moduleId] = Math.max(1, owned[m.moduleId] ?? 0);
      p.fittedModules[shipId] = kept;
    }
    p.ownedModules = owned;
  }

  list(): PilotProfile[] {
    return [...this.profiles];
  }

  getActive(): PilotProfile | null {
    try {
      const raw = localStorage.getItem(ACTIVE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  createOrUpdate(name: string, patch: Partial<PilotProfile> = {}): PilotProfile {
    const now = Date.now();
    const existing = this.profiles.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      const updated = { ...existing, ...patch, updatedAt: now, version: VERSION };
      this.profiles = this.profiles.map((p) => (p.id === existing.id ? updated : p));
    } else {
      const p: PilotProfile = {
        id: `p_${now}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        shipId: patch.shipId ?? 'helix',
        difficulty: patch.difficulty ?? 'easy',
        credits: patch.credits ?? STARTING_CREDITS,
        startingCreditsGranted: patch.startingCreditsGranted ?? true,
        score: patch.score ?? 0,
        kills: patch.kills ?? 0,
        oreCollected: patch.oreCollected ?? 0,
        updatedAt: now,
        version: VERSION,
        fittedModules: patch.fittedModules ?? {},
        ownedModules: (() => {
          const counts = normalizeOwnedModules(patch.ownedModules as unknown as string[] | OwnedModuleCounts);
          const empty = Object.keys(counts).length === 0;
          if (empty) return { ...STARTER_OWNED_MODULE_COUNTS };
          return counts;
        })(),
        loadouts: patch.loadouts ?? {},
        startingZone: patch.startingZone ?? 'nova-prime',
        visitedZones: patch.visitedZones ?? ['nova-prime'],
        discoveredResources: patch.discoveredResources ?? ['ferrite'],
        missions: patch.missions ?? [],
        missionBoard: patch.missionBoard ?? [],
        missionBoardRefreshedAt: patch.missionBoardRefreshedAt ?? 0,
        stationStorage: patch.stationStorage ?? ({} as Record<ResourceKind, number>),
        refineryQueue: patch.refineryQueue ?? [],
        marketPrices: patch.marketPrices ?? ({} as Record<ResourceKind, { buy: number; sell: number; trend: number }>),
        colonyPlots: patch.colonyPlots ?? Array.from({ length: 6 }, (_, i) => ({ id: i, level: 0 })),
      };
      this.profiles.push(p);
    }
    this.save();
    const active = this.profiles.find((p) => p.name.toLowerCase() === name.toLowerCase())!;
    localStorage.setItem(ACTIVE, JSON.stringify(active));
    return active;
  }

  setActive(p: PilotProfile): void {
    localStorage.setItem(ACTIVE, JSON.stringify(p));
  }

  updateActive(patch: Partial<PilotProfile>): PilotProfile | null {
    const active = this.getActive();
    if (!active) return null;
    const updated = { ...active, ...patch, updatedAt: Date.now(), version: VERSION };
    this.profiles = this.profiles.map((pr) => (pr.id === active.id ? updated : pr));
    this.save();
    localStorage.setItem(ACTIVE, JSON.stringify(updated));
    return updated;
  }

  reset(): void {
    this.profiles = [];
    localStorage.removeItem(KEY);
    localStorage.removeItem(ACTIVE);
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.profiles));
    } catch {
      // ignore
    }
  }
}
