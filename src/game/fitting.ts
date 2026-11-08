import type { ModuleDefinition, PlayerLoadout, FittedModule, SlotType } from './types';
import type { ResourceKind } from './types';
import { MODULE_SELL_RATE } from './config';

export type ModuleTier = 'I' | 'II' | 'III';

export interface ExtendedModuleDefinition extends ModuleDefinition {
  tier: ModuleTier;
  cost: Partial<Record<ResourceKind, number>>;
  creditCost: number;
  capacitorUse?: number;
  cooldown?: number;
  range?: number;
  duration?: number;
  repairRate?: number;
  miningYield?: number;
  alphaDamage?: number;
  dps?: number;
}

export interface FitValidationResult {
  valid: boolean;
  reason?: string;
}

export interface FitStats {
  dps: number;
  alphaDamage: number;
  range: number;
  maxShield: number;
  maxHull: number;
  resistKinetic: number;
  resistThermal: number;
  resistEnergy: number;
  resistEm: number;
  speed: number;
  agility: number;
  capacitorCapacity: number;
  capacitorRecharge: number;
  miningYield: number;
  cargoCapacity: number;
  repairRate: number;
  cpuUsed: number;
  cpuCapacity: number;
  powerUsed: number;
  powerCapacity: number;
}

export const MODULE_DEFINITIONS: ExtendedModuleDefinition[] = [
  // High slots - weapons
  {
    id: 'pulse_laser_mk1',
    name: { en: 'Pulse Laser Mk I', ar: 'ليزر نبضي Mk I' },
    type: 'weapon',
    slot: 'high',
    cpu: 12,
    powergrid: 8,
    tier: 'I',
    creditCost: 8500,
    cost: { ferrite: 15, aurium: 5 },
    capacitorUse: 8,
    cooldown: 0.16,
    range: 600,
    alphaDamage: 12,
    dps: 75,
    description: { en: 'Basic pulse energy weapon', ar: 'سلاح طاقة نبضي أساسي' },
    effects: { weaponDamage: 12, range: 600 },
  },
  {
    id: 'pulse_laser_mk2',
    name: { en: 'Pulse Laser Mk II', ar: 'ليزر نبضي Mk II' },
    type: 'weapon',
    slot: 'high',
    cpu: 18,
    powergrid: 12,
    tier: 'II',
    creditCost: 24000,
    cost: { ferrite: 28, aurium: 12, cryonite: 4 },
    capacitorUse: 12,
    cooldown: 0.14,
    range: 650,
    alphaDamage: 18,
    dps: 128.6,
    description: { en: 'Enhanced pulse laser with better tracking', ar: 'ليزر نبضي محسن' },
    effects: { weaponDamage: 18, range: 650 },
  },
  {
    id: 'beam_cannon_mk1',
    name: { en: 'Beam Cannon Mk I', ar: 'مدفع شعاعي Mk I' },
    type: 'weapon',
    slot: 'high',
    cpu: 22,
    powergrid: 16,
    tier: 'II',
    creditCost: 32000,
    cost: { ferrite: 35, aurium: 18, magmarite: 6 },
    capacitorUse: 16,
    cooldown: 0.22,
    range: 720,
    alphaDamage: 32,
    dps: 145.5,
    description: { en: 'Heavy beam weapon with good range', ar: 'سلاح شعاعي ثقيل' },
    effects: { weaponDamage: 32, range: 720 },
  },
  {
    id: 'strip_miner_mk1',
    name: { en: 'Strip Miner Mk I', ar: 'مستخرج شريطي Mk I' },
    type: 'miner',
    slot: 'high',
    cpu: 14,
    powergrid: 10,
    tier: 'I',
    creditCost: 12000,
    cost: { ferrite: 22, cryonite: 8 },
    capacitorUse: 6,
    cooldown: 2.0,
    range: 250,
    miningYield: 6.5,
    description: { en: 'Standard asteroid strip miner', ar: 'مستخرج شريطي قياسي' },
    effects: { miningRate: 6.5, miningRange: 250 },
  },
  {
    id: 'strip_miner_mk2',
    name: { en: 'Strip Miner Mk II', ar: 'مستخرج شريطي Mk II' },
    type: 'miner',
    slot: 'high',
    cpu: 20,
    powergrid: 14,
    tier: 'II',
    creditCost: 28000,
    cost: { ferrite: 38, cryonite: 16, hexite: 5 },
    capacitorUse: 9,
    cooldown: 1.8,
    range: 280,
    miningYield: 9.2,
    description: { en: 'High-yield strip miner', ar: 'مستخرج شريطي عالي الإنتاج' },
    effects: { miningRate: 9.2, miningRange: 280 },
  },
  {
    id: 'repair_beam_mk1',
    name: { en: 'Remote Repair Beam Mk I', ar: 'شعاع إصلاح عن بعد Mk I' },
    type: 'repair',
    slot: 'high',
    cpu: 16,
    powergrid: 12,
    tier: 'I',
    creditCost: 15000,
    cost: { ferrite: 25, aurium: 10, nanocarbon: 6 },
    capacitorUse: 10,
    cooldown: 0.8,
    range: 400,
    repairRate: 45,
    description: { en: 'Basic remote hull and armor repair', ar: 'إصلاح أساسي عن بعد' },
    effects: { repairRate: 45, range: 400 },
  },
  {
    id: 'repair_beam_mk2',
    name: { en: 'Remote Repair Beam Mk II', ar: 'شعاع إصلاح عن بعد Mk II' },
    type: 'repair',
    slot: 'high',
    cpu: 24,
    powergrid: 18,
    tier: 'II',
    creditCost: 38000,
    cost: { ferrite: 42, aurium: 22, nanocarbon: 12, thryxium: 4 },
    capacitorUse: 15,
    cooldown: 0.7,
    range: 450,
    repairRate: 72,
    description: { en: 'Advanced repair beam with better throughput', ar: 'شعاع إصلاح متقدم' },
    effects: { repairRate: 72, range: 450 },
  },
  // Mid slots
  {
    id: 'shield_booster_mk1',
    name: { en: 'Shield Booster Mk I', ar: 'معزز درع Mk I' },
    type: 'shield',
    slot: 'mid',
    cpu: 14,
    powergrid: 16,
    tier: 'I',
    creditCost: 18000,
    cost: { ferrite: 30, aurium: 14 },
    capacitorUse: 12,
    cooldown: 4.0,
    description: { en: 'Boosts shield regeneration and capacity', ar: 'يعزز تجديد الدرع والسعة' },
    effects: { shieldCapacity: 65, shieldRegen: 6 },
  },
  {
    id: 'shield_booster_mk2',
    name: { en: 'Shield Booster Mk II', ar: 'معزز درع Mk II' },
    type: 'shield',
    slot: 'mid',
    cpu: 20,
    powergrid: 22,
    tier: 'II',
    creditCost: 42000,
    cost: { ferrite: 48, aurium: 28, cryonite: 10 },
    capacitorUse: 18,
    cooldown: 3.5,
    description: { en: 'Enhanced shield booster with strong recharge', ar: 'معزز درع قوي' },
    effects: { shieldCapacity: 95, shieldRegen: 10 },
  },
  {
    id: 'afterburner_mk1',
    name: { en: 'Afterburner Mk I', ar: 'حارق خلفي Mk I' },
    type: 'propulsion',
    slot: 'mid',
    cpu: 12,
    powergrid: 18,
    tier: 'I',
    creditCost: 16000,
    cost: { ferrite: 28, magmarite: 12 },
    capacitorUse: 20,
    cooldown: 8.0,
    description: { en: 'Temporary speed burst', ar: 'دفعة سرعة مؤقتة' },
    effects: { speedBoost: 28, agility: 0.15 },
  },
  {
    id: 'capacitor_battery_mk1',
    name: { en: 'Capacitor Battery Mk I', ar: 'بطارية مكثف Mk I' },
    type: 'reactor',
    slot: 'mid',
    cpu: 10,
    powergrid: 14,
    tier: 'I',
    creditCost: 14000,
    cost: { ferrite: 24, aurium: 12 },
    capacitorUse: 0,
    description: { en: 'Increases capacitor capacity and recharge', ar: 'يزيد سعة المكثف وإعادة الشحن' },
    effects: { capacitorCapacity: 85, capacitorRecharge: 12 },
  },
  {
    id: 'capacitor_battery_mk2',
    name: { en: 'Capacitor Battery Mk II', ar: 'بطارية مكثف Mk II' },
    type: 'reactor',
    slot: 'mid',
    cpu: 16,
    powergrid: 20,
    tier: 'II',
    creditCost: 34000,
    cost: { ferrite: 40, aurium: 24, hexite: 8 },
    capacitorUse: 0,
    description: { en: 'High-capacity capacitor array', ar: 'مصدر مكثف عالي السعة' },
    effects: { capacitorCapacity: 125, capacitorRecharge: 18 },
  },
  {
    id: 'sensor_booster_mk1',
    name: { en: 'Sensor Booster Mk I', ar: 'معزز استشعار Mk I' },
    type: 'scanner',
    slot: 'mid',
    cpu: 12,
    powergrid: 10,
    tier: 'I',
    creditCost: 11000,
    cost: { ferrite: 18, aurium: 10, hexite: 6 },
    capacitorUse: 5,
    description: { en: 'Improved targeting range and lock speed', ar: 'مدى استهداف أفضل' },
    effects: { scanRange: 200, lockRange: 150 },
  },
  // Low slots
  {
    id: 'armor_plate_mk1',
    name: { en: 'Reinforced Armor Plate Mk I', ar: 'لوحة درع معززة Mk I' },
    type: 'armor',
    slot: 'low',
    cpu: 4,
    powergrid: 2,
    tier: 'I',
    creditCost: 10000,
    cost: { ferrite: 40 },
    capacitorUse: 0,
    description: { en: 'Basic hull reinforcement', ar: 'تقوية هيكل أساسية' },
    effects: { hull: 35, armor: 25 },
  },
  {
    id: 'armor_plate_mk2',
    name: { en: 'Reinforced Armor Plate Mk II', ar: 'لوحة درع معززة Mk II' },
    type: 'armor',
    slot: 'low',
    cpu: 6,
    powergrid: 3,
    tier: 'II',
    creditCost: 26000,
    cost: { ferrite: 70, magmarite: 15 },
    capacitorUse: 0,
    description: { en: 'Heavy armor plating', ar: 'درع ثقيل معزز' },
    effects: { hull: 55, armor: 42 },
  },
  {
    id: 'damage_control_mk1',
    name: { en: 'Damage Control Unit Mk I', ar: 'وحدة تحكم بالأضرار Mk I' },
    type: 'armor',
    slot: 'low',
    cpu: 8,
    powergrid: 4,
    tier: 'I',
    creditCost: 22000,
    cost: { ferrite: 35, nanocarbon: 18 },
    capacitorUse: 0,
    description: { en: 'Improved hull repairs and resistance', ar: 'تحسين إصلاح الهيكل' },
    effects: { hullRegen: 2.5, resistKinetic: 0.08 },
  },
  {
    id: 'cargo_expander_mk1',
    name: { en: 'Cargo Expander Mk I', ar: 'موسع حمولات Mk I' },
    type: 'cargo',
    slot: 'low',
    cpu: 3,
    powergrid: 1,
    tier: 'I',
    creditCost: 9000,
    cost: { ferrite: 32 },
    capacitorUse: 0,
    description: { en: 'Increases cargo hold capacity', ar: 'يزيد سعة الحمولة' },
    effects: { cargoCapacity: 28 },
  },
  {
    id: 'cargo_expander_mk2',
    name: { en: 'Cargo Expander Mk II', ar: 'موسع حمولات Mk II' },
    type: 'cargo',
    slot: 'low',
    cpu: 4,
    powergrid: 2,
    tier: 'II',
    creditCost: 20000,
    cost: { ferrite: 55, hexite: 12 },
    capacitorUse: 0,
    description: { en: 'Expanded cargo bay', ar: 'سعة حمولة أكبر' },
    effects: { cargoCapacity: 48 },
  },
  // Rigs would go here but spec says rig slots - adding basic ones
];

export const RIG_MODULES: ExtendedModuleDefinition[] = [
  {
    id: 'rig_weapon_mk1',
    name: { en: 'Weapon Rig Mk I', ar: 'تركيب سلاح Mk I' },
    type: 'weapon',
    slot: 'low', // simplified - treat as low for now
    cpu: 25,
    powergrid: 12,
    tier: 'I',
    creditCost: 45000,
    cost: { ferrite: 60, aurium: 30, thryxium: 15 },
    capacitorUse: 0,
    description: { en: 'Rig that improves weapon performance', ar: 'تركيب يحسن أداء السلاح' },
    effects: { weaponDamage: 15, weaponRoF: 0.12 },
  },
];

export function getModuleById(id: string): ExtendedModuleDefinition | undefined {
  return MODULE_DEFINITIONS.find(m => m.id === id) || RIG_MODULES.find(m => m.id === id);
}

export function getModulesBySlot(slot: SlotType): ExtendedModuleDefinition[] {
  return MODULE_DEFINITIONS.filter(m => m.slot === slot);
}

export function getModulesByType(type: ModuleDefinition['type']): ExtendedModuleDefinition[] {
  return MODULE_DEFINITIONS.filter(m => m.type === type);
}

export function validateFit(
  loadout: PlayerLoadout,
  moduleId: string,
  slotIndex: number,
  slotType: SlotType,
  ownedCounts?: OwnedModuleCounts,
): FitValidationResult {
  const module = getModuleById(moduleId);
  if (!module) {
    return { valid: false, reason: 'Module not found' };
  }

  if (module.slot !== slotType) {
    return { valid: false, reason: `Wrong slot type: requires ${module.slot}` };
  }

  // Check slot count
  const maxSlots = slotType === 'high' ? loadout.highSlots : slotType === 'mid' ? loadout.midSlots : loadout.lowSlots;
  if (slotIndex >= maxSlots) {
    return { valid: false, reason: `No ${slotType} slots available` };
  }

  // Check ownership availability (4D). Replacing the same slot frees that instance.
  if (ownedCounts) {
    const available = getAvailableModuleCount(ownedCounts, loadout, moduleId, slotIndex, slotType);
    if (available <= 0) {
      return { valid: false, reason: 'No free copies available' };
    }
  }

  // Check if slot already filled (slot indices are per type, 4D fix).
  const existingFit = loadout.modules.find(
    (m) => m.slotIndex === slotIndex && (getModuleById(m.moduleId)?.slot ?? 'high') === slotType,
  );

  // Calculate CPU and power usage
  const currentCpu = calculateCpuUsed(loadout);
  const currentPower = calculatePowerUsed(loadout);

  const newCpu = currentCpu + module.cpu - (existingFit ? (getModuleById(existingFit.moduleId)?.cpu || 0) : 0);
  const newPower = currentPower + module.powergrid - (existingFit ? (getModuleById(existingFit.moduleId)?.powergrid || 0) : 0);

  if (newCpu > loadout.cpuCapacity) {
    return { valid: false, reason: `Insufficient CPU: ${newCpu}/${loadout.cpuCapacity}` };
  }

  if (newPower > loadout.powergridCapacity) {
    return { valid: false, reason: `Insufficient Power Grid: ${newPower}/${loadout.powergridCapacity}` };
  }

  return { valid: true };
}

export function calculateCpuUsed(loadout: PlayerLoadout): number {
  let total = 0;
  for (const fitted of loadout.modules) {
    const module = getModuleById(fitted.moduleId);
    if (module) total += module.cpu;
  }
  return total;
}

export function calculatePowerUsed(loadout: PlayerLoadout): number {
  let total = 0;
  for (const fitted of loadout.modules) {
    const module = getModuleById(fitted.moduleId);
    if (module) total += module.powergrid;
  }
  return total;
}

/**
 * 4D: build the effective combat/mining loadout used by the simulation.
 * Pure (no DOM/Three imports) so it can run on the future server too.
 */
export function applyModulesToLoadout(loadout: PlayerLoadout): PlayerLoadout {
  let miningRate = loadout.miningRate;
  let miningRange = loadout.miningRange;
  let cargoCapacity = loadout.cargoCapacity;
  let maxHealth = loadout.maxHealth;
  let maxShield = loadout.maxShield;
  let baseSpeed = loadout.baseSpeed;
  let weaponDamage = loadout.weaponDamage;
  let fireInterval = loadout.fireInterval;

  for (const fitted of loadout.modules) {
    const module = getModuleById(fitted.moduleId);
    if (!module) continue;
    // Avoid double-counting: strip miners expose both miningYield and effects.miningRate.
    const yieldValue = module.miningYield ?? (module.effects.miningRate as number | undefined);
    if (yieldValue) miningRate += yieldValue;
    if (module.type === 'miner' && module.range) miningRange = Math.max(miningRange, module.range);
    if (module.effects.cargoCapacity) cargoCapacity += module.effects.cargoCapacity as number;
    if (module.effects.hull) maxHealth += module.effects.hull as number;
    if (module.effects.shieldCapacity) maxShield += module.effects.shieldCapacity as number;
    if (module.effects.speedBoost) baseSpeed += module.effects.speedBoost as number;
    // Weapons share one firing arc in the current simulation, so module damage
    // is folded in at 40% to avoid five weapons stacking into an instant-kill.
    if (module.effects.weaponDamage) weaponDamage += (module.effects.weaponDamage as number) * 0.4;
    if (module.type === 'weapon' && module.cooldown && module.cooldown < fireInterval) {
      fireInterval = module.cooldown;
    }
  }

  return {
    ...loadout,
    miningRate,
    miningRange,
    cargoCapacity: Math.round(cargoCapacity),
    maxHealth: Math.round(maxHealth),
    maxShield: Math.round(maxShield),
    baseSpeed,
    weaponDamage,
    fireInterval,
  };
}

export function calculateFitStats(loadout: PlayerLoadout): FitStats {
  let dps = 0;
  let alphaDamage = 0;
  let range = 400;
  let maxShield = loadout.maxShield;
  let maxHull = loadout.maxHealth;
  let resistKinetic = 0;
  const resistThermal = 0;
  const resistEnergy = 0;
  const resistEm = 0;
  let speed = loadout.baseSpeed;
  let agility = 1.0;
  let capacitorCapacity = 100;
  let capacitorRecharge = 15;
  let miningYield = loadout.miningRate;
  let cargoCapacity = loadout.cargoCapacity;
  let repairRate = 0;
  
  for (const fitted of loadout.modules) {
    const module = getModuleById(fitted.moduleId);
    if (!module) continue;
    
    // Apply effects
    if (module.effects.weaponDamage) {
      alphaDamage += module.effects.weaponDamage as number;
    }
    if (module.dps) dps += module.dps;
    if (module.range && module.range > range) range = module.range;
    if (module.effects.shieldCapacity) maxShield += module.effects.shieldCapacity as number;
    if (module.effects.hull) maxHull += module.effects.hull as number;
    if (module.effects.resistKinetic) resistKinetic += module.effects.resistKinetic as number;
    if (module.effects.speedBoost) speed += module.effects.speedBoost as number;
    if (module.effects.agility) agility += module.effects.agility as number;
    if (module.effects.capacitorCapacity) capacitorCapacity += module.effects.capacitorCapacity as number;
    if (module.effects.capacitorRecharge) capacitorRecharge += module.effects.capacitorRecharge as number;
    const yieldValue = module.miningYield ?? (module.effects.miningRate as number | undefined);
    if (yieldValue) miningYield += yieldValue;
    if (module.effects.cargoCapacity) cargoCapacity += module.effects.cargoCapacity as number;
    if (module.repairRate) repairRate += module.repairRate;
  }
  
  // If no weapons fitted, use base
  if (dps === 0 && alphaDamage === 0) {
    dps = 75; // base
    alphaDamage = 12;
  } else if (dps === 0 && alphaDamage > 0) {
    dps = alphaDamage / 0.16; // rough estimate
  }
  
  return {
    dps: Math.round(dps),
    alphaDamage: Math.round(alphaDamage),
    range: Math.round(range),
    maxShield: Math.round(maxShield),
    maxHull: Math.round(maxHull),
    resistKinetic,
    resistThermal,
    resistEnergy,
    resistEm,
    speed: Math.round(speed),
    agility,
    capacitorCapacity: Math.round(capacitorCapacity),
    capacitorRecharge: Math.round(capacitorRecharge),
    miningYield: Math.round(miningYield * 10) / 10,
    cargoCapacity: Math.round(cargoCapacity),
    repairRate: Math.round(repairRate),
    cpuUsed: calculateCpuUsed(loadout),
    cpuCapacity: loadout.cpuCapacity,
    powerUsed: calculatePowerUsed(loadout),
    powerCapacity: loadout.powergridCapacity,
  };
}

export function fitModule(
  loadout: PlayerLoadout,
  moduleId: string,
  slotIndex: number,
  slotType: SlotType,
  ownedCounts?: OwnedModuleCounts,
): PlayerLoadout {
  const validation = validateFit(loadout, moduleId, slotIndex, slotType, ownedCounts);
  if (!validation.valid) {
    return loadout; // Don't modify if invalid
  }

  const module = getModuleById(moduleId);
  if (!module) return loadout;

  // Remove existing module in the same typed slot only (high/mid/low share indices, 4D fix).
  const filtered = loadout.modules.filter(
    (m) => !(m.slotIndex === slotIndex && (getModuleById(m.moduleId)?.slot ?? 'high') === slotType),
  );

  const newFitted: FittedModule = {
    moduleId,
    slotIndex,
  };

  return {
    ...loadout,
    modules: [...filtered, newFitted],
  };
}

export function unfitModule(loadout: PlayerLoadout, slotIndex: number, slotType?: SlotType): PlayerLoadout {
  return {
    ...loadout,
    modules: loadout.modules.filter((m) => {
      if (m.slotIndex !== slotIndex) return true;
      if (!slotType) return false;
      return (getModuleById(m.moduleId)?.slot ?? 'high') !== slotType;
    }),
  };
}

export type OwnedModuleCounts = Record<string, number>;

/** Normalize legacy string[] or counts to a counts record (4D). */
export function normalizeOwnedModules(owned: string[] | OwnedModuleCounts | undefined | null): OwnedModuleCounts {
  if (!owned) return {};
  if (Array.isArray(owned)) {
    const out: OwnedModuleCounts = {};
    for (const id of owned) out[id] = (out[id] ?? 0) + 1;
    return out;
  }
  const out: OwnedModuleCounts = {};
  for (const [id, n] of Object.entries(owned)) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    if (v > 0) out[id] = v;
  }
  return out;
}

/** Starter owned modules (4D): enough copies to fill every slot of every hull at start. */
export const STARTER_OWNED_MODULE_COUNTS: OwnedModuleCounts = {
  // high: weapons/miners/repair (max 5 high slots on ironharrow)
  pulse_laser_mk1: 5, beam_cannon_mk1: 3,
  strip_miner_mk1: 5, strip_miner_mk2: 3,
  repair_beam_mk1: 3, repair_beam_mk2: 2,
  // mid (max 4 on helix)
  shield_booster_mk1: 4, shield_booster_mk2: 3,
  afterburner_mk1: 4, sensor_booster_mk1: 4,
  capacitor_battery_mk1: 4, capacitor_battery_mk2: 3,
  // low (max 4 on deepmaw)
  armor_plate_mk1: 4, armor_plate_mk2: 3,
  cargo_expander_mk1: 4, cargo_expander_mk2: 3,
  // auto-fit may suggest mk2 variants not in older starter set
  pulse_laser_mk2: 3,
};

/** Back-compat list of starter module IDs. */
export const STARTER_OWNED_MODULE_IDS: readonly string[] = Object.keys(STARTER_OWNED_MODULE_COUNTS);

export function getFittedCount(loadout: PlayerLoadout, moduleId: string): number {
  let n = 0;
  for (const m of loadout.modules) if (m.moduleId === moduleId) n += 1;
  return n;
}

/**
 * Available copies = owned - fitted. The optional slot identifies a copy that
 * would be replaced, so refitting the same slot does not need a second copy.
 * Slot indices are per type (high/mid/low), so the type is required for an
 * exact match when both are supplied.
 */
export function getAvailableModuleCount(
  ownedCounts: OwnedModuleCounts | undefined,
  loadout: PlayerLoadout,
  moduleId: string,
  replaceSlotIndex?: number,
  replaceSlotType?: SlotType,
): number {
  const owned = Math.max(0, Math.floor(ownedCounts?.[moduleId] ?? 0));
  let fitted = 0;
  for (const m of loadout.modules) {
    if (m.moduleId !== moduleId) continue;
    const sameSlot =
      replaceSlotIndex !== undefined &&
      m.slotIndex === replaceSlotIndex &&
      (replaceSlotType === undefined || (getModuleById(m.moduleId)?.slot ?? 'high') === replaceSlotType);
    if (sameSlot) continue;
    fitted += 1;
  }
  return Math.max(0, owned - fitted);
}

/**
 * 4D: rebuild a saved fitting into a validated module list for a hull. Saved
 * fits are persisted per ship as { moduleId, slotIndex } pairs; invalid ids or
 * out-of-range/duplicate slots are dropped so a bad save can never break a run.
 */
export function restoreFittedModules(
  loadout: PlayerLoadout,
  saved: Array<{ moduleId: string; slotIndex: number }> | undefined,
): FittedModule[] {
  if (!saved || saved.length === 0) return [];
  const limit = (slot: SlotType) =>
    slot === 'high' ? loadout.highSlots : slot === 'mid' ? loadout.midSlots : loadout.lowSlots;
  const used = new Set<string>();
  const out: FittedModule[] = [];
  for (const entry of saved) {
    const mod = getModuleById(entry.moduleId);
    if (!mod) continue;
    const index = Math.floor(Number(entry.slotIndex));
    if (!Number.isFinite(index) || index < 0 || index >= limit(mod.slot)) continue;
    const key = `${mod.slot}:${index}`;
    if (used.has(key)) continue;
    used.add(key);
    out.push({ moduleId: mod.id, slotIndex: index });
  }
  return out;
}

export function getModuleSellPrice(moduleId: string, sellRate = MODULE_SELL_RATE): number {
  const mod = getModuleById(moduleId);
  return mod ? Math.max(0, Math.floor(mod.creditCost * sellRate)) : 0;
}

/** Suggested module IDs for a role (legacy helper). */
export function getAutoFitSuggestions(role: 'combat' | 'support' | 'mining'): string[] {
  if (role === 'combat') return ['pulse_laser_mk2', 'shield_booster_mk2', 'armor_plate_mk2', 'capacitor_battery_mk1'];
  if (role === 'support') return ['repair_beam_mk2', 'shield_booster_mk2', 'capacitor_battery_mk2', 'armor_plate_mk1'];
  return ['strip_miner_mk2', 'cargo_expander_mk2', 'armor_plate_mk1', 'capacitor_battery_mk1'];
}

/** Auto-fit fills all slots when possible given CPU/PG and ownership (4D). */
export function getAutoFit(
  loadout: PlayerLoadout,
  role: 'combat' | 'support' | 'mining',
  ownedCounts?: OwnedModuleCounts,
): PlayerLoadout {
  let next: PlayerLoadout = { ...loadout, modules: [] };
  const plan: Array<{ slot: SlotType; ids: string[] }> = role === 'combat'
    ? [
        { slot: 'high', ids: ['pulse_laser_mk2', 'pulse_laser_mk1', 'beam_cannon_mk1'] },
        { slot: 'mid', ids: ['shield_booster_mk2', 'shield_booster_mk1', 'capacitor_battery_mk2', 'capacitor_battery_mk1', 'afterburner_mk1', 'sensor_booster_mk1'] },
        { slot: 'low', ids: ['armor_plate_mk2', 'armor_plate_mk1', 'damage_control_mk1', 'cargo_expander_mk1'] },
      ]
    : role === 'support'
      ? [
          { slot: 'high', ids: ['repair_beam_mk2', 'repair_beam_mk1', 'pulse_laser_mk1'] },
          { slot: 'mid', ids: ['shield_booster_mk2', 'shield_booster_mk1', 'capacitor_battery_mk2', 'capacitor_battery_mk1', 'sensor_booster_mk1'] },
          { slot: 'low', ids: ['armor_plate_mk2', 'armor_plate_mk1', 'damage_control_mk1'] },
        ]
      : [
          { slot: 'high', ids: ['strip_miner_mk2', 'strip_miner_mk1', 'pulse_laser_mk1'] },
          { slot: 'mid', ids: ['shield_booster_mk1', 'afterburner_mk1', 'capacitor_battery_mk1', 'sensor_booster_mk1'] },
          { slot: 'low', ids: ['cargo_expander_mk2', 'cargo_expander_mk1', 'armor_plate_mk1', 'damage_control_mk1'] },
        ];

  const slotCount = (s: SlotType) => (s === 'high' ? next.highSlots : s === 'mid' ? next.midSlots : next.lowSlots);
  for (const group of plan) {
    const count = slotCount(group.slot);
    for (let i = 0; i < count; i++) {
      for (const id of group.ids) {
        const mod = getModuleById(id);
        if (!mod || mod.slot !== group.slot) continue;
        if (ownedCounts && getAvailableModuleCount(ownedCounts, next, id) <= 0) continue;
        const v = validateFit(next, id, i, group.slot, ownedCounts);
        if (v.valid) { next = fitModule(next, id, i, group.slot, ownedCounts); break; }
      }
    }
  }
  return next;
}
