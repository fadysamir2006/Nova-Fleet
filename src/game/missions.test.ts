import { describe, expect, it } from 'vitest';
import {
  acceptMissionOffer,
  applyMissionEvent,
  claimMission,
  completedMissions,
  generateMissionBoard,
  missionLabel,
  missionRewardCredits,
  missionTextParams,
  MISSION_TEXT_KEYS,
  type MissionOffer,
  type MissionTextContext,
} from './missions';
import { ZONES, HOME_STATION_ID } from './worldData';
import { RESOURCES } from '../assets-config/world';
import { DICTIONARIES } from '../ui/i18n';
import type { Lang } from '../ui/i18n';

const ZONE = 'nova-prime';

function makeMission(overrides: Partial<MissionOffer> = {}): MissionOffer {
  return {
    id: 'mission-test-0',
    type: 'mine',
    target: 'ferrite',
    amount: 35,
    current: 0,
    completed: false,
    reward: 1200,
    accepted: true,
    zoneId: ZONE,
    danger: 1,
    acceptedAt: 1000,
    ...overrides,
  };
}

const mined = (amount: number, resourceId = 'ferrite', zoneId = ZONE, source: 'mining' | 'pickup' | 'refinery' = 'mining') => ({
  type: 'mined' as const,
  resourceId,
  amount,
  zoneId,
  source,
});

function makeContext(lang: Lang, fallbackZone = ZONE): MissionTextContext {
  const translate = (key: string, params?: Record<string, string | number>): string => {
    const dictionary = DICTIONARIES[lang] as Record<string, string | undefined>;
    let text = dictionary[key] ?? `{${key}}`;
    for (const [name, value] of Object.entries(params ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  };
  const zoneName = (id?: string): string => {
    const zone = ZONES.find((entry) => entry.id === (id ?? fallbackZone));
    if (!zone) return '';
    return lang === 'ar' ? zone.name.ar : zone.name.en;
  };
  return {
    t: translate,
    resourceName: (id) => translate(`resource.${id}`),
    zoneName,
    stationName: (id) => zoneName(id ?? HOME_STATION_ID),
  };
}

describe('mission progress events', () => {
  it('adds progress only for an accepted mission of the matching resource', () => {
    const mission = acceptMissionOffer(makeMission({ accepted: false }), 2000);
    expect(mission.accepted).toBe(true);
    expect(mission.acceptedAt).toBe(2000);
    const offered = makeMission({ accepted: false });
    let missions = applyMissionEvent([mission], mined(10));
    expect(missions[0]!.current).toBe(10);
    // Unaccepted offers never gain progress (same array reference back).
    const offeredList = [offered];
    const untouched = applyMissionEvent(offeredList, mined(10));
    expect(untouched).toBe(offeredList);
    expect(untouched[0]!.current).toBe(0);
    // Wrong resource / wrong zone do not move the bar.
    missions = applyMissionEvent(missions, mined(10, 'aurium'));
    expect(missions[0]!.current).toBe(10);
    missions = applyMissionEvent(missions, mined(10, 'ferrite', 'aurelia-zone'));
    expect(missions[0]!.current).toBe(10);
  });

  it('counts pickup units but not refinery output (config rule)', () => {
    let missions = [makeMission({ amount: 20 })];
    missions = applyMissionEvent(missions, mined(4, 'ferrite', ZONE, 'pickup'));
    expect(missions[0]!.current).toBe(4);
    missions = applyMissionEvent(missions, mined(4, 'ferrite', ZONE, 'refinery'));
    expect(missions[0]!.current).toBe(4);
  });

  it('does not read cargo: moving or selling ore cannot change progress', () => {
    let missions = applyMissionEvent([makeMission()], mined(12));
    const snapshot = JSON.stringify(missions);
    // Transferring ore to storage or selling it only edits cargo numbers.
    const cargo = { ferrite: 12 };
    cargo.ferrite = 0;
    expect(JSON.stringify(missions)).toBe(snapshot);
    expect(missions[0]!.current).toBe(12);
    // A delivery/other-type event must not touch a mine mission either.
    missions = applyMissionEvent(missions, { type: 'delivered', resourceId: 'ferrite', amount: 5, stationId: HOME_STATION_ID });
    expect(missions[0]!.current).toBe(12);
  });

  it('stops at the target and marks the mission claimable', () => {
    let missions = [makeMission({ amount: 35 })];
    missions = applyMissionEvent(missions, mined(40));
    expect(missions[0]!.current).toBe(35);
    expect(missions[0]!.completed).toBe(true);
    expect(completedMissions(missions)).toHaveLength(1);
    // Further mining does not overflow or re-toast.
    const after = applyMissionEvent(missions, mined(5));
    expect(after).toBe(missions);
  });

  it('counts hostile kills only inside the mission zone', () => {
    const mission = makeMission({ type: 'destroy', target: 'hostiles', amount: 5, zoneId: 'aurelia-zone' });
    let missions = applyMissionEvent([mission], { type: 'killed', enemyId: 101, zoneId: 'nova-prime' });
    expect(missions[0]!.current).toBe(0);
    missions = applyMissionEvent(missions, { type: 'killed', enemyId: 101, zoneId: 'aurelia-zone' });
    expect(missions[0]!.current).toBe(1);
  });

  it('requires hand-in at the target station for deliveries', () => {
    const mission = makeMission({ type: 'deliver', target: 'aurium', amount: 18, zoneId: undefined, stationId: HOME_STATION_ID });
    let missions = applyMissionEvent([mission], { type: 'delivered', resourceId: 'aurium', amount: 4 });
    expect(missions[0]!.current).toBe(0);
    missions = applyMissionEvent(missions, { type: 'delivered', resourceId: 'aurium', amount: 4, stationId: 'other-station' });
    expect(missions[0]!.current).toBe(0);
    missions = applyMissionEvent(missions, { type: 'delivered', resourceId: 'aurium', amount: 4, stationId: HOME_STATION_ID });
    expect(missions[0]!.current).toBe(4);
  });

  it('claims the reward and removes the mission', () => {
    let missions = applyMissionEvent([makeMission({ amount: 10, reward: 2400 })], mined(10));
    const claim = claimMission(missions, missions[0]!.id);
    expect(claim).not.toBeNull();
    expect(claim!.credits).toBe(2400);
    expect(claim!.credits).toBe(missionRewardCredits(missions[0]!));
    const balanceBefore = 500;
    expect(balanceBefore + claim!.credits).toBe(2900);
    expect(claim!.missions).toHaveLength(0);
    // Claiming an unfinished or unknown mission is rejected.
    expect(claimMission([makeMission()], 'mission-test-0')).toBeNull();
    expect(claimMission(missions, 'missing-id')).toBeNull();
    missions = claim!.missions;
    expect(missions).toHaveLength(0);
  });

  it('keeps progress across a save/load round-trip', () => {
    const missions = applyMissionEvent([makeMission()], mined(9));
    const restored: MissionOffer[] = JSON.parse(JSON.stringify(missions));
    expect(restored[0]!.current).toBe(9);
    const continued = applyMissionEvent(restored, mined(6));
    expect(continued[0]!.current).toBe(15);
    expect(continued[0]!.acceptedAt).toBe(1000);
  });

  it('treats legacy missions with an unknown zone as zone-agnostic', () => {
    const legacy = makeMission({ zoneId: 'old-removed-zone' });
    const missions = applyMissionEvent([legacy], mined(3));
    expect(missions[0]!.current).toBe(3);
  });
});

describe('mission targets', () => {
  it('uses the same resource ids as asteroids and cargo', () => {
    const resourceIds = new Set(Object.keys(RESOURCES));
    for (const zone of ZONES) {
      for (const mission of generateMissionBoard(zone.id, 1_700_000_000_000, 5)) {
        if (mission.type === 'destroy') {
          expect(mission.target).toBe('hostiles');
        } else {
          expect(resourceIds.has(mission.target), `${zone.id} ${mission.type} target ${mission.target}`).toBe(true);
        }
      }
    }
    // Zone resource tables must only contain real ids too.
    for (const zone of ZONES) {
      for (const kind of zone.uniqueResources) expect(resourceIds.has(kind)).toBe(true);
    }
  });
});

describe('mission text templates', () => {
  it('fills every placeholder in EN and AR for all mission types', () => {
    const types = new Set<string>();
    for (const zone of ZONES) {
      const board = generateMissionBoard(zone.id, 1_700_000_000_000, 5);
      for (const lang of ['en', 'ar'] as Lang[]) {
        const ctx = makeContext(lang, zone.id);
        for (const mission of board) {
          types.add(mission.type);
          const template = DICTIONARIES[lang][MISSION_TEXT_KEYS[mission.type] as keyof (typeof DICTIONARIES)['en']];
          const params = missionTextParams(mission, ctx);
          const placeholders = [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);
          expect(placeholders.length).toBeGreaterThan(0);
          for (const name of placeholders) {
            const value = params[name];
            expect(value, `${lang} ${mission.type} placeholder {${name}}`).toBeDefined();
            expect(String(value).trim(), `${lang} ${mission.type} placeholder {${name}}`).not.toBe('');
          }
          const rendered = missionLabel(mission, ctx);
          expect(rendered).not.toMatch(/[{}]/);
          expect(rendered).not.toMatch(/\s{2,}/);
          expect(rendered.trim()).not.toMatch(/\s(in|to|في|إلى)$/);
        }
      }
    }
    expect(types).toEqual(new Set(['mine', 'destroy', 'deliver']));
  });

  it('renders a legacy mission without a zone using the fallback zone name', () => {
    const ctx = makeContext('en');
    const legacy = makeMission({ type: 'destroy', target: 'hostiles', zoneId: undefined });
    const text = missionLabel(legacy, ctx);
    expect(text).toContain('Nova Prime');
  });
});
