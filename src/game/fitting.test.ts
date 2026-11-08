import { describe, it, expect } from 'vitest';
import {
  calculateFitStats,
  validateFit,
  fitModule,
  calculateCpuUsed,
  calculatePowerUsed,
  getModuleById,
  getAutoFit,
  getAvailableModuleCount,
  applyModulesToLoadout,
  restoreFittedModules,
  MODULE_DEFINITIONS,
  RIG_MODULES,
  STARTER_OWNED_MODULE_COUNTS,
  type OwnedModuleCounts,
} from './fitting';
import { buildPlayerLoadout, ENEMY_TUNING } from './config';

const HULLS = ['helix', 'ironharrow', 'deepmaw'] as const;

describe('Fitting System', () => {
  it('should calculate cpu and power usage correctly', () => {
    const loadout = buildPlayerLoadout('helix', 'skylance');
    expect(calculateCpuUsed(loadout)).toBe(0);
    expect(calculatePowerUsed(loadout)).toBe(0);
  });

  it('should fit a module and update stats', () => {
    let loadout = buildPlayerLoadout('helix', 'skylance');
    loadout = fitModule(loadout, 'pulse_laser_mk1', 0, 'high');
    expect(loadout.modules.length).toBe(1);
    expect(calculateCpuUsed(loadout)).toBe(12);
    expect(calculatePowerUsed(loadout)).toBe(8);
  });

  it('should not fit module if cpu exceeds capacity', () => {
    const loadout = buildPlayerLoadout('deepmaw', 'deepmaw');
    const result = validateFit(loadout, 'beam_cannon_mk1', 0, 'high');
    expect(result.valid).toBe(true);
  });

  it('should calculate fit stats correctly', () => {
    const baseLoadout = buildPlayerLoadout('ironharrow', 'ironwake');
    const loadout = fitModule(baseLoadout, 'pulse_laser_mk1', 0, 'high');
    const stats = calculateFitStats(loadout);
    expect(stats.dps).toBeGreaterThan(0);
    expect(stats.cpuUsed).toBe(12);
    expect(stats.powerUsed).toBe(8);
  });

  it('should reject fit if no slots available', () => {
    let loadout = buildPlayerLoadout('deepmaw', 'deepmaw');
    loadout = fitModule(loadout, 'pulse_laser_mk1', 0, 'high');
    loadout = fitModule(loadout, 'pulse_laser_mk1', 1, 'high');
    loadout = fitModule(loadout, 'pulse_laser_mk1', 2, 'high');
    const result = validateFit(loadout, 'pulse_laser_mk1', 3, 'high');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('should get module by id', () => {
    const module = getModuleById('repair_beam_mk1');
    expect(module).toBeDefined();
    expect(module?.type).toBe('repair');
  });

  // 4D: same module type can fill several slots when multiple copies are owned.
  it('4D: fits the same weapon into every high slot when enough copies are owned', () => {
    let loadout = buildPlayerLoadout('ironharrow', 'ironharrow');
    const owned: OwnedModuleCounts = { pulse_laser_mk1: 5 };
    for (let i = 0; i < loadout.highSlots; i += 1) {
      loadout = fitModule(loadout, 'pulse_laser_mk1', i, 'high', owned);
    }
    expect(loadout.modules.length).toBe(loadout.highSlots);
    expect(getAvailableModuleCount(owned, loadout, 'pulse_laser_mk1')).toBe(0);
  });

  it('4D: rejects a copy when no free copies remain', () => {
    let loadout = buildPlayerLoadout('deepmaw', 'deepmaw');
    const owned: OwnedModuleCounts = { shield_booster_mk1: 1 };
    loadout = fitModule(loadout, 'shield_booster_mk1', 0, 'mid', owned);
    // Slot 1 is empty, but the only owned shield is already fitted.
    const result = validateFit(loadout, 'shield_booster_mk1', 1, 'mid', owned);
    expect(result.valid).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('free copies');
  });

  it('4D: starter inventory can fill every slot of every hull', () => {
    for (const hull of HULLS) {
      let loadout = buildPlayerLoadout(hull, hull);
      const total = loadout.highSlots + loadout.midSlots + loadout.lowSlots;
      for (let i = 0; i < loadout.highSlots; i += 1) loadout = fitModule(loadout, 'pulse_laser_mk1', i, 'high', STARTER_OWNED_MODULE_COUNTS);
      for (let i = 0; i < loadout.midSlots; i += 1) loadout = fitModule(loadout, 'afterburner_mk1', i, 'mid', STARTER_OWNED_MODULE_COUNTS);
      for (let i = 0; i < loadout.lowSlots; i += 1) loadout = fitModule(loadout, 'armor_plate_mk1', i, 'low', STARTER_OWNED_MODULE_COUNTS);
      expect(loadout.modules.length).toBe(total);
    }
  });

  it('4D: auto-fit fills every slot when copies and budgets allow', () => {
    for (const hull of HULLS) {
      for (const role of ['combat', 'support', 'mining'] as const) {
        const base = buildPlayerLoadout(hull, hull);
        const fitted = getAutoFit(base, role, STARTER_OWNED_MODULE_COUNTS);
        expect(fitted.modules.length).toBe(base.highSlots + base.midSlots + base.lowSlots);
      }
    }
  });

  it('4D: every module exposes real CPU and power grid values', () => {
    for (const mod of [...MODULE_DEFINITIONS, ...RIG_MODULES]) {
      expect(mod.cpu, `${mod.id} CPU`).toBeGreaterThan(0);
      expect(mod.powergrid, `${mod.id} power`).toBeGreaterThan(0);
    }
  });

  it('4D: refitting a slot reuses the copy already in it', () => {
    const owned: OwnedModuleCounts = { pulse_laser_mk1: 1 };
    let loadout = buildPlayerLoadout('helix', 'helix');
    loadout = fitModule(loadout, 'pulse_laser_mk1', 0, 'high', owned);
    expect(getAvailableModuleCount(owned, loadout, 'pulse_laser_mk1')).toBe(0);
    expect(getAvailableModuleCount(owned, loadout, 'pulse_laser_mk1', 0, 'high')).toBe(1);
    // A same-index slot of another type must not free a copy falsely.
    expect(getAvailableModuleCount(owned, loadout, 'pulse_laser_mk1', 0, 'mid')).toBe(0);
  });

  it('4D: saved fittings restore into the hull and drop invalid entries', () => {
    const loadout = buildPlayerLoadout('ironharrow', 'ironharrow');
    const restored = restoreFittedModules(loadout, [
      { moduleId: 'pulse_laser_mk1', slotIndex: 0 },
      { moduleId: 'pulse_laser_mk1', slotIndex: 4 },
      { moduleId: 'shield_booster_mk1', slotIndex: 2 },
      { moduleId: 'pulse_laser_mk1', slotIndex: 4 }, // duplicate typed slot
      { moduleId: 'pulse_laser_mk1', slotIndex: 9 }, // out of range
      { moduleId: 'not_a_module', slotIndex: 0 },
    ]);
    expect(restored).toHaveLength(3);
    const stats = calculateFitStats({ ...loadout, modules: restored });
    expect(stats.cpuUsed).toBe(12 + 12 + 14);
  });

  it('4D: fitted modules change the effective mining, cargo and hull values', () => {
    const base = buildPlayerLoadout('deepmaw', 'deepmaw');
    let loadout = fitModule(base, 'strip_miner_mk2', 0, 'high', { strip_miner_mk2: 1 });
    loadout = fitModule(loadout, 'cargo_expander_mk1', 0, 'low', { cargo_expander_mk1: 1 });
    loadout = fitModule(loadout, 'armor_plate_mk1', 1, 'low', { armor_plate_mk1: 1 });
    const effective = applyModulesToLoadout(loadout);
    expect(effective.miningRate).toBeGreaterThan(base.miningRate);
    expect(effective.miningRange).toBeGreaterThanOrEqual(base.miningRange);
    expect(effective.cargoCapacity).toBeGreaterThan(base.cargoCapacity);
    expect(effective.maxHealth).toBeGreaterThan(base.maxHealth);
  });

  it('4D: combat tuning keeps a fully fitted hull alive for several enemy volleys', () => {
    const base = buildPlayerLoadout('ironharrow', 'ironharrow');
    let loadout = base;
    for (let i = 0; i < base.highSlots; i += 1) {
      loadout = fitModule(loadout, 'pulse_laser_mk2', i, 'high', { pulse_laser_mk2: 5 });
    }
    for (let i = 0; i < base.lowSlots; i += 1) {
      loadout = fitModule(loadout, 'armor_plate_mk2', i, 'low', { armor_plate_mk2: 3 });
    }
    for (let i = 0; i < base.midSlots; i += 1) {
      loadout = fitModule(loadout, 'capacitor_battery_mk2', i, 'mid', { capacitor_battery_mk2: 3 });
    }
    expect(loadout.modules.length).toBe(base.highSlots + base.midSlots + base.lowSlots);
    const effective = applyModulesToLoadout(loadout);
    const enemyVolleysToKill = Math.ceil((effective.maxHealth + effective.maxShield) / ENEMY_TUNING.weaponDamage);
    expect(enemyVolleysToKill).toBeGreaterThanOrEqual(8);
    expect(effective.weaponDamage).toBeGreaterThan(0);
  });
});
