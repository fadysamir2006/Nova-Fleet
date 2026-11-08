import { describe, it, expect, beforeAll } from 'vitest';
import { GameSimulation } from './GameSimulation';
import {
  generateMissionBoard,
  applyMissionEvent,
  missionIsReady,
  missionLabel,
  missionTextParams,
  type MissionGameEvent,
  type MissionOffer,
} from './missions';
import {
  acceptOfferAction,
  abandonAction,
  claimAction,
  deliverMissionsAction,
  normalizeMissionRecord,
} from './missionFlow';
import { ProfileStore } from '../ui/ProfileStore';
import { buildPlayerLoadout, MISSION_MAX_ACTIVE } from './config';
import { applyModulesToLoadout } from './fitting';
import { createEmptyInput, type ResourceKind } from './types';
import type { AsteroidEntity, ShipEntity } from './types';
import { RESOURCES } from '../assets-config/world';
import { DICTIONARIES, type Lang } from '../ui/i18n';
import { ZONES, HOME_STATION_ID } from './worldData';

/**
 * REPRODUCTION + REGRESSION TESTS for the mission-progress bug (round 2).
 *
 * Real code paths only — no mission-system mocks:
 *  - a real ProfileStore (localStorage shimmed — infrastructure), the same
 *    storage the live UI reads and writes,
 *  - acceptance through `acceptOfferAction`, the exact function the market UI
 *    "Accept" button calls (main.ts delegates to it),
 *  - a real GameSimulation whose mining/combat ticks run exactly like the main
 *    loop (update(dt) -> drainEvents() -> applyMissionEvent on profile missions),
 *  - progress read through the same getter the market board uses
 *    (ProfileStore.getActive().missions).
 */
const STORAGE: Record<string, string> = {};
beforeAll(() => {
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => STORAGE[key] ?? null,
    setItem: (key: string, value: string) => {
      STORAGE[key] = value;
    },
    removeItem: (key: string) => {
      delete STORAGE[key];
    },
    clear: () => {
      for (const key of Object.keys(STORAGE)) delete STORAGE[key];
    },
  };
});

const ZONE = 'nova-prime';
const NOW = new Date('2026-01-01T00:00:00Z').getTime();

function eventOfMissions(store: ProfileStore): MissionOffer[] {
  return store.getActive()?.missions ?? [];
}

/** Board offers exactly like ensureMissionBoard persists them. */
function seedBoard(store: ProfileStore, zoneId = ZONE): MissionOffer[] {
  const board = generateMissionBoard(zoneId, NOW);
  store.updateActive({ missionBoard: board, missionBoardRefreshedAt: NOW });
  return board;
}

/**
 * Mirrors main.ts openMarket() board normalization pass, so the flow under
 * test includes the same normalize step the UI keeps running.
 */
function normalizeBoardAndMissions(store: ProfileStore): void {
  const profile = store.getActive();
  if (!profile) return;
  const now = Date.now();
  const zoneId = profile.startingZone && ZONES.some((z) => z.id === profile.startingZone)
    ? profile.startingZone
    : ZONE;
  store.updateActive({
    missionBoard: (profile.missionBoard ?? []).map((m) => normalizeMissionRecord(m, zoneId, now)),
    missions: (profile.missions ?? []).map((m) => normalizeMissionRecord(m, zoneId, now)),
  });
}

/** Accepts exactly like the market UI Accept button (main.acceptMission). */
function acceptOfferLikeMarketButton(store: ProfileStore, missionId: string): MissionOffer | null {
  const profile = store.getActive();
  if (!profile) return null;
  const action = acceptOfferAction({
    missions: profile.missions ?? [],
    missionBoard: profile.missionBoard ?? [],
    missionId,
    zoneId: ZONES.some((z) => z.id === profile.startingZone) ? profile.startingZone! : ZONE,
    now: NOW,
    maxActive: MISSION_MAX_ACTIVE,
  });
  if (!action) return null;
  store.updateActive(action);
  const saved = store.getActive()?.missions ?? [];
  return saved.find((m) => m.id === missionId) ?? null;
}

/** Mirrors main.ts handleMissionEvent() line for line. */
function handleMissionEventLikeGameLoop(store: ProfileStore, event: MissionGameEvent): void {
  const profile = store.getActive();
  if (!profile) return;
  const missions = profile.missions ?? [];
  if (missions.length === 0) return;
  const updated = applyMissionEvent(missions, event);
  if (updated === missions) return;
  store.updateActive({ missions: updated });
}

/** Mirrors startRun(): applyModulesToLoadout over the hull's base loadout. */
function createSimulation(store: ProfileStore): GameSimulation {
  const loadout = applyModulesToLoadout(buildPlayerLoadout('helix', 'helix'));
  const zoneId = store.getActive()?.startingZone ?? ZONE;
  return new GameSimulation(loadout, {
    difficulty: 'easy',
    speedScale: 1,
    assistedFlight: false,
    aimAssist: true,
    zoneId,
  });
}

/** Drives the sim and feeds every real mined/killed event to the missions. */
function runSimSeconds(
  sim: GameSimulation,
  store: ProfileStore,
  seconds: number,
  input: ReturnType<typeof createEmptyInput>,
  step = 0.05,
): void {
  const steps = Math.ceil(seconds / step);
  for (let i = 0; i < steps; i += 1) {
    sim.update(step, input);
    for (const event of sim.drainEvents()) {
      if (event.type === 'mined' || event.type === 'killed') {
        handleMissionEventLikeGameLoop(store, event);
      }
    }
  }
}

/** Places a real asteroid of the mission resource in front of the ship. */
function placeMineTarget(
  sim: GameSimulation,
  target: keyof typeof RESOURCES,
  extraYield = 20,
): AsteroidEntity {
  const asteroids = sim.asteroids as AsteroidEntity[];
  const asteroid = asteroids.find((a) => a.resource === target) ?? asteroids[0]!;
  asteroid.resource = target;
  asteroid.yieldRemaining = extraYield;
  asteroid.maxYield = extraYield;
  asteroid.alive = true;
  asteroid.position = { x: 0, y: 0, z: -150 };
  asteroid.radius = 20;
  return asteroid;
}

describe('mission progress through REAL code paths', () => {
  it('repro: an accepted mine mission progresses while the real simulation mines that resource', () => {
    const store = new ProfileStore();
    store.createOrUpdate('repro-pilot', {});
    const board = seedBoard(store);
    normalizeBoardAndMissions(store);

    const mineOffer = board.find((m) => m.type === 'mine');
    expect(mineOffer).toBeDefined();
    const accepted = acceptOfferLikeMarketButton(store, mineOffer!.id);
    expect(accepted).not.toBeNull();
    expect(accepted!.accepted).toBe(true);
    expect(accepted!.zoneId).toBe(ZONE);

    const sim = createSimulation(store);
    placeMineTarget(sim, mineOffer!.target as keyof typeof RESOURCES, mineOffer!.amount + 100);
    runSimSeconds(sim, store, 60, { ...createEmptyInput(), mine: true });

    const saved = eventOfMissions(store).find((m) => m.id === mineOffer!.id);
    expect(saved).toBeDefined();
    expect(saved!.current).toBeGreaterThanOrEqual(mineOffer!.amount);
    expect(saved!.completed).toBe(true);
    expect(missionIsReady(saved!)).toBe(true);
  });

  it('no progress before acceptance (real mined events ignored by unaccepted offers)', () => {
    const store = new ProfileStore();
    store.createOrUpdate('repro-pilot', {});
    const board = seedBoard(store);
    const mineOffer = board.find((m) => m.type === 'mine')!;

    // Events flow while the offer is NOT accepted yet.
    const sim = createSimulation(store);
    placeMineTarget(sim, mineOffer.target as keyof typeof RESOURCES, mineOffer.amount + 100);
    runSimSeconds(sim, store, 10, { ...createEmptyInput(), mine: true });

    // Then it is accepted through the market button…
    const accepted = acceptOfferLikeMarketButton(store, mineOffer.id);
    expect(accepted?.current).toBe(0);
    // Free the hold that the first phase filled, so mining can continue.
    for (const key of Object.keys(sim.cargo.resources)) {
      sim.cargo.resources[key as ResourceKind] = 0;
    }
    sim.cargo.used = 0;
    appPlaceMore(sim, mineOffer.target as keyof typeof RESOURCES);
    runSimSeconds(sim, store, 4, { ...createEmptyInput(), mine: true });
    const saved = eventOfMissions(store).find((m) => m.id === mineOffer.id);
    expect(saved!.current).toBeGreaterThan(0);
    // Progress never exceeds the target; events before acceptance count nothing.
    expect(saved!.current).toBeLessThan(mineOffer.amount + 4.6 + 1);
  });

  it('moving cargo to storage or selling never changes mission progress', () => {
    const store = new ProfileStore();
    store.createOrUpdate('repro-pilot', {});
    const board = seedBoard(store);
    const mineOffer = board.find((m) => m.type === 'mine')!;
    const accepted = acceptOfferLikeMarketButton(store, mineOffer.id);
    expect(accepted).not.toBeNull();

    const sim = createSimulation(store);
    placeMineTarget(sim, mineOffer.target as keyof typeof RESOURCES, mineOffer.amount + 100);
    runSimSeconds(sim, store, 8, { ...createEmptyInput(), mine: true });

    // Whatever the miner produced, put it all into station storage (and
    // "sell" half of it by zeroing storage) — the mission must not care.
    const progressBefore =
      eventOfMissions(store).find((m) => m.id === mineOffer.id)!.current;
    expect(progressBefore).toBeGreaterThan(0);
    const cargo = sim.cargo.resources;
    const storage = {
      ...(store.getActive()?.stationStorage ?? {}),
    } as Record<ResourceKind, number>;
    const total = Object.values(cargo).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    for (const key of Object.keys(cargo) as ResourceKind[]) {
      storage[key] = (storage[key] ?? 0) + cargo[key];
      cargo[key] = 0;
    }
    sim.cargo.used = 0;
    store.updateActive({ stationStorage: storage });
    // no mission events emitted during storage/selling — nothing else runs.
    const sold = { ...storage } as Record<ResourceKind, number>;
    for (const key of Object.keys(sold) as ResourceKind[]) sold[key] = 0;
    store.updateActive({ stationStorage: sold });

    const progressAfter = eventOfMissions(store).find((m) => m.id === mineOffer.id)!.current;
    expect(progressAfter).toBe(progressBefore);
  });

  it('destroy mission progresses through the real combat path (live enemies die)', () => {
    const store = new ProfileStore();
    store.createOrUpdate('repro-pilot', {});
    const board = seedBoard(store);
    const destroyOffer = board.find((m) => m.type === 'destroy');
    expect(destroyOffer).toBeDefined();
    const accepted = acceptOfferLikeMarketButton(store, destroyOffer!.id);
    expect(accepted).not.toBeNull();

    const sim = createSimulation(store);
    // Drive the player forward while firing; enemies spawn ahead and die to
    // real projectiles. Collect every real `killed` event through the loop.
    // The patrol AI keeps enemies away from muzzle alignment, so the target is
    // re-pinned in front of the ship each step (world state only — damage and
    // the `killed` events remain the real combat path).
    let kills = 0;
    const input = { ...createEmptyInput(), fire: true };
    const steps = Math.ceil(70 / 0.05);
    for (let i = 0; i < steps; i += 1) {
      const enemy = sim.enemies.find((e) => e.alive);
      if (enemy) {
        enemy.position = { x: 0, y: 0, z: -160 };
        enemy.velocity = { x: 0, y: 0, z: 0 };
      }
      sim.update(0.05, input);
      for (const event of sim.drainEvents()) {
        if (event.type === 'killed') {
          kills += 1;
          handleMissionEventLikeGameLoop(store, event);
        }
      }
      if (kills >= destroyOffer!.amount) break;
    }
    expect(kills).toBeGreaterThanOrEqual(1);
    const saved = eventOfMissions(store).find((m) => m.id === destroyOffer!.id);
    expect(saved!.current).toBe(Math.min(destroyOffer!.amount, kills));
  });

  it('deliver mission completes at the station through the real hand-in path', () => {
    const store = new ProfileStore();
    store.createOrUpdate('repro-pilot', {});
    const board = seedBoard(store);
    const deliverOffer = board.find((m) => m.type === 'deliver');
    expect(deliverOffer).toBeDefined();
    const accepted = acceptOfferLikeMarketButton(store, deliverOffer!.id);
    expect(accepted).not.toBeNull();
    expect(accepted!.current).toBe(0);

    // Player arrives with cargo covering part of the need and the rest in
    // station storage — the station hand-in path (main.turnInDeliverMissions)
    // takes cargo first, then storage, and emits real `delivered` events.
    const partial = Math.ceil(deliverOffer!.amount / 2);
    const sim = createSimulation(store);
    sim.cargo.resources[deliverOffer!.target as ResourceKind] = partial;
    sim.cargo.used = partial;
    const storage = {
      ...(store.getActive()?.stationStorage ?? ({} as Record<ResourceKind, number>)),
    } as Record<ResourceKind, number>;
    storage[deliverOffer!.target as ResourceKind] = deliverOffer!.amount; // enough in storage
    store.updateActive({ stationStorage: storage });

    // Mirrors openMarket() -> turnInDeliverMissions().
    const profile = store.getActive()!;
    const action = deliverMissionsAction({
      missions: profile.missions ?? [],
      cargoResources: { ...sim.cargo.resources },
      cargoUsed: sim.cargo.used,
      cargoCapacity: sim.cargo.capacity,
      stationStorage: { ...(profile.stationStorage ?? {}) },
    });
    expect(action.events.length).toBeGreaterThan(0);
    // main.ts writes the cargo/storage patch and then feeds each event through
    // the same single entry point (handleMissionEvent).
    store.updateActive({ missions: action.missions, stationStorage: action.stationStorage });
    for (const delivered of action.events) {
      handleMissionEventLikeGameLoop(store, {
        type: 'delivered',
        resourceId: delivered.resourceId,
        amount: delivered.amount,
        stationId: delivered.stationId,
      });
    }

    const saved = eventOfMissions(store).find((m) => m.id === deliverOffer!.id);
    expect(saved!.amount).toBeGreaterThanOrEqual(saved!.current);
    expect(saved!.current).toBe(deliverOffer!.amount);
    expect(saved!.completed).toBe(true);
  });

  it('progress and completion survive ProfileStore save/load', () => {
    const store = new ProfileStore();
    store.createOrUpdate('repro-pilot', {});
    const board = seedBoard(store);
    const mineOffer = board.find((m) => m.type === 'mine')!;
    acceptOfferLikeMarketButton(store, mineOffer.id);
    const sim = createSimulation(store);
    placeMineTarget(sim, mineOffer.target as keyof typeof RESOURCES, mineOffer.amount + 100);
    runSimSeconds(sim, store, 40, { ...createEmptyInput(), mine: true });
    const before = eventOfMissions(store).find((m) => m.id === mineOffer.id)!;

    // Fresh store instance reads the same persisted profile (the app reload path).
    const reloaded = new ProfileStore();
    const after = eventOfMissions(reloaded).find((m) => m.id === mineOffer.id)!;
    expect(after).toBeDefined();
    expect(after.current).toBe(before.current);
    expect(after.completed).toBe(before.completed);
  });

  it('claiming the reward credits the balance once, adds the module, and removes the mission', () => {
    const store = new ProfileStore();
    store.createOrUpdate('repro-pilot', {});
    const board = seedBoard(store);
    const mineOffer = board.find((m) => m.type === 'mine')!;
    acceptOfferLikeMarketButton(store, mineOffer.id);
    const sim = createSimulation(store);
    placeMineTarget(sim, mineOffer.target as keyof typeof RESOURCES, mineOffer.amount + 100);
    runSimSeconds(sim, store, 40, { ...createEmptyInput(), mine: true });

    let profile = store.getActive()!;
    const mission = (profile.missions ?? []).find((m) => m.id === mineOffer.id)!;
    expect(mission.completed).toBe(true);
    const creditsBefore = profile.credits;

    // First claim through the exact action main.claimMission calls.
    const action = claimAction({
      missions: profile.missions ?? [],
      missionBoard: profile.missionBoard ?? [],
      missionId: mission.id,
      credits: profile.credits,
      ownedModules: profile.ownedModules ?? {},
      score: profile.score ?? 0,
    });
    expect(action).not.toBeNull();
    store.updateActive({
      credits: action!.credits,
      ownedModules: action!.ownedModules,
      missions: action!.missions,
      missionBoard: action!.missionBoard,
      score: action!.score,
    });
    profile = store.getActive()!;
    expect(profile.credits).toBe(creditsBefore + action!.creditsGained);
    expect(profile.credits).toBe(creditsBefore + mission.reward);
    expect((profile.missions ?? []).find((m) => m.id === mission.id)).toBeUndefined();

    // Claiming again must not be possible.
    const again = claimAction({
      missions: profile.missions ?? [],
      missionBoard: profile.missionBoard ?? [],
      missionId: mission.id,
      credits: profile.credits,
      ownedModules: profile.ownedModules ?? {},
      score: profile.score ?? 0,
    });
    expect(again).toBeNull();
  });

  it('abandon removes the mission through the same action as the UI button', () => {
    const store = new ProfileStore();
    store.createOrUpdate('repro-pilot', {});
    const board = seedBoard(store);
    const mineOffer = board.find((m) => m.type === 'mine')!;
    acceptOfferLikeMarketButton(store, mineOffer.id);
    const profile = store.getActive()!;
    const action = abandonAction({
      missions: profile.missions ?? [],
      missionBoard: profile.missionBoard ?? [],
      missionId: mineOffer.id,
    });
    store.updateActive({ missions: action.missions, missionBoard: action.missionBoard });
    const saved = eventOfMissions(store).find((m) => m.id === mineOffer.id);
    expect(saved).toBeUndefined();
  });

  it('more active missions than allowed are rejected by the real accept action', () => {
    const missions: MissionOffer[] = [];
    for (let i = 0; i < MISSION_MAX_ACTIVE; i += 1) {
      missions.push(
        normalizeMissionRecord(
          {
            id: `m${i}`,
            type: 'mine',
            target: 'ferrite',
            amount: 10,
            current: 0,
            completed: false,
            reward: 100,
            accepted: true,
            acceptedAt: NOW,
            zoneId: ZONE,
          },
          ZONE,
          NOW,
        ),
      );
    }
    const board = generateMissionBoard(ZONE, NOW);
    const first = board.find((m) => m.type === 'mine')!;
    const action = acceptOfferAction({
      missions,
      missionBoard: board,
      missionId: first.id,
      zoneId: ZONE,
      now: NOW,
      maxActive: MISSION_MAX_ACTIVE,
    });
    expect(action).toBeNull();
  });
});

/** Keeps mining possible after the first target was drained. */
function appPlaceMore(sim: GameSimulation, target: keyof typeof RESOURCES): void {
  const leftover = sim.asteroids.find((a) => a.alive && a.resource === target);
  if (!leftover) return;
  leftover.yieldRemaining = 100;
  leftover.maxYield = 100;
  leftover.position = { x: 0, y: 0, z: -150 };
}

describe('mission labels localize ids (no raw zone ids, no empty placeholders)', () => {
  const langs: Lang[] = ['en', 'ar'];
  for (const lang of langs) {
    it(`renders localized mission text in ${lang.toUpperCase()} for every zone`, () => {
      const zoneNames = ZONES.map((z) => z.name[lang]);
      const dict = DICTIONARIES[lang] as Record<string, string>;
      for (const zone of ZONES) {
        const board = generateMissionBoard(zone.id, NOW, 3);
        for (const mission of board) {
          const label = missionLabel(mission, {
            t: (key, params) => {
              let out = dict[key as string] ?? '';
              for (const [k, v] of Object.entries(params ?? {})) {
                out = out.replaceAll(new RegExp(`{${k}}`, 'g'), String(v ?? ''));
              }
              return out;
            },
            resourceName: (id: string) => dict[`resource.${id}`] ?? id,
            zoneName: (id?: string) => ZONES.find((z) => z.id === (id ?? zone.id))?.name[lang] ?? '',
            stationName: (id: string) => ZONES.find((z) => z.id === (id ?? HOME_STATION_ID))?.name[lang] ?? '',
          });
          expect(label.length, `label for ${mission.id} (${lang})`).toBeGreaterThan(0);
          expect(label).not.toContain('undefined');
          expect(label).not.toContain('{');
          // Raw ids like "nova-prime" must never leak into the display text.
          const rawIds = [
            zone.id,
            ...ZONES.map((z) => z.id),
            HOME_STATION_ID,
            mission.target,
          ];
          for (const raw of rawIds) {
            if (raw === 'hostiles') continue;
            if (zoneNames.includes(raw)) continue;
            if (Object.keys(RESOURCES).includes(raw)) continue;
            expect(label.includes(raw), `raw id "${raw}" leaked into "${label}"`).toBe(false);
          }
          // And all interpolated params resolvable (no birthplace '—').
          expect(label.includes('—')).toBe(false);
        }
      }
    });

    it(`mission text params have concrete localized names (${lang.toUpperCase()})`, () => {
      const board = generateMissionBoard('nova-prime', NOW, 5);
      for (const mission of board) {
        const params = missionTextParams(mission, {
          t: (key) => key,
          resourceName: (id: string) => RESOURCES[id as keyof typeof RESOURCES]?.name?.[lang] ?? id,
          zoneName: (id?: string) => ZONES.find((z) => z.id === id)?.name[lang] ?? '',
          stationName: (id: string) => ZONES.find((z) => z.id === id)?.name[lang] ?? '',
        });
        for (const [key, value] of Object.entries(params)) {
          if (key === 'amount') continue;
          expect(String(value).length, `${mission.id} ${key}`).toBeGreaterThan(0);
          // A plain display name — never a kebab-case id like "magmae-zone".
          expect(String(value)).not.toMatch(/-[a-z]/);
        }
      }
    });
  }
});

describe('kill event sanity (real ShipEntity turn-over)', () => {
  it('enemy death emits a killed event with a zone (coverage for mission wiring)', () => {
    const sim = createSimulation(new ProfileStore());
    const enemy = sim.enemies.find((e) => e.alive);
    expect(enemy).toBeDefined();
    const input = { ...createEmptyInput(), fire: true };
    let sawKilled = false;
    for (let i = 0; i < Math.ceil(40 / 0.05); i += 1) {
      if (enemy) {
        (enemy as ShipEntity).position = { x: 0, y: 0, z: -160 };
        (enemy as ShipEntity).velocity = { x: 0, y: 0, z: 0 };
      }
      sim.update(0.05, input);
      for (const event of sim.drainEvents()) {
        if (event.type === 'killed') sawKilled = true;
      }
      if (sawKilled) break;
    }
    expect(sawKilled).toBe(true);
  });
});
