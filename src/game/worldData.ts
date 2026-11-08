import type { ResourceKind } from './types';

export type ZoneType = 'planetary' | 'debris' | 'nebula' | 'station' | 'gate';

export interface Zone {
  id: string;
  name: { en: string; ar: string };
  type: ZoneType;
  parentStar?: string;
  orbitIndex: number;
  dangerLevel: 1 | 2 | 3 | 4 | 5;
  uniqueResources: ResourceKind[];
  asteroidDensity: number;
  rarity: number;
  miningDifficulty: number;
  respawnRate: number;
  description: { en: string; ar: string };
}

export interface RefineRecipe {
  id: string;
  input: ResourceKind;
  output: ResourceKind;
  inputAmount: number;
  outputAmount: number;
  timeSeconds: number;
  creditCost: number;
}

export interface ResourceInfo {
  kind: ResourceKind;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  category: 'raw' | 'refined';
  uses: string[];
  basePriceMin: number;
  basePriceMax: number;
  rarity: number;
}

export const ZONES: Zone[] = [
  {
    id: 'nova-prime',
    name: { en: 'Nova Prime', ar: 'نوفا برايم' },
    type: 'planetary',
    orbitIndex: 0,
    dangerLevel: 1,
    uniqueResources: ['ferrite', 'aurium'],
    asteroidDensity: 0.6,
    rarity: 0.3,
    miningDifficulty: 1,
    respawnRate: 0.8,
    description: { en: 'The central star system.', ar: 'نظام النجوم المركزي.' },
  },
  {
    id: 'aurelia-zone',
    name: { en: 'Aurelia Belt', ar: 'حزام أوريليا' },
    type: 'planetary',
    orbitIndex: 1,
    dangerLevel: 1,
    uniqueResources: ['aurium', 'ferrite'],
    asteroidDensity: 0.8,
    rarity: 0.4,
    miningDifficulty: 1,
    respawnRate: 0.9,
    description: { en: 'Temperate orbital belt rich in aurium.', ar: 'حزام مداري معتدل غني بالأوريوم.' },
  },
  {
    id: 'magmae-zone',
    name: { en: 'Magmæ Expanse', ar: 'امتداد ماغما' },
    type: 'planetary',
    orbitIndex: 2,
    dangerLevel: 3,
    uniqueResources: ['magmarite', 'nanocarbon'],
    asteroidDensity: 0.7,
    rarity: 0.6,
    miningDifficulty: 2,
    respawnRate: 0.7,
    description: { en: 'Volcanic field with dense magmarite deposits.', ar: 'حقل بركاني كثيف برواسب الماغمارايت.' },
  },
  {
    id: 'glacius-zone',
    name: { en: 'Glacius Fracture', ar: 'كسر غلاسياس' },
    type: 'planetary',
    orbitIndex: 3,
    dangerLevel: 2,
    uniqueResources: ['cryonite', 'hexite'],
    asteroidDensity: 0.75,
    rarity: 0.65,
    miningDifficulty: 2,
    respawnRate: 0.75,
    description: { en: 'Icy fractures containing cryonite crystals.', ar: 'كسور جليدية تحتوي على بلورات الكريونيت.' },
  },
  {
    id: 'thryx-zone',
    name: { en: 'Thryx Wreckage', ar: 'حطام ثريكس' },
    type: 'planetary',
    orbitIndex: 4,
    dangerLevel: 4,
    uniqueResources: ['hexite', 'thryxium'],
    asteroidDensity: 0.85,
    rarity: 0.8,
    miningDifficulty: 3,
    respawnRate: 0.6,
    description: { en: 'Metallic desert with rare hexite veins.', ar: 'صحراء معدنية ذات عروق هكسيت نادرة.' },
  },
  {
    id: 'kratos-zone',
    name: { en: 'Kratos Nebula Edge', ar: 'حافة سديم كراتوس' },
    type: 'planetary',
    orbitIndex: 5,
    dangerLevel: 5,
    uniqueResources: ['thryxium', 'isotopes'],
    asteroidDensity: 0.9,
    rarity: 0.9,
    miningDifficulty: 4,
    respawnRate: 0.5,
    description: { en: 'Dense gas giant rings with volatile isotopes.', ar: 'حلقات كثيفة لعملاق غازي تحتوي على نظائر متطايرة.' },
  },
  {
    id: 'debris-field',
    name: { en: 'Derelict Debris Field', ar: 'حقل حطام مهجور' },
    type: 'debris',
    orbitIndex: 6,
    dangerLevel: 4,
    uniqueResources: ['nanocarbon', 'ferrite'],
    asteroidDensity: 0.95,
    rarity: 0.75,
    miningDifficulty: 3,
    respawnRate: 0.65,
    description: { en: 'Remnants of ancient wreckage rich in nanocarbon.', ar: 'بقايا حطام قديم غني بالنانوكربون.' },
  },
  {
    id: 'nebula-pocket',
    name: { en: 'Nebula Pocket', ar: 'جيب سديمي' },
    type: 'nebula',
    orbitIndex: 7,
    dangerLevel: 5,
    uniqueResources: ['isotopes', 'alloys'],
    asteroidDensity: 0.8,
    rarity: 0.95,
    miningDifficulty: 5,
    respawnRate: 0.4,
    description: { en: 'Ionized pocket with fusion isotopes and rare alloys.', ar: 'جيب مؤين يحتوي على نظائر اندماجية وسبائك نادرة.' },
  },
  {
    id: 'solace',
    name: { en: 'Solace Station', ar: 'محطة سولاس' },
    type: 'station',
    orbitIndex: 8,
    dangerLevel: 1,
    uniqueResources: [],
    asteroidDensity: 0,
    rarity: 0,
    miningDifficulty: 0,
    respawnRate: 0,
    description: { en: 'Orbital trade hub.', ar: 'مركز تجاري مداري.' },
  },
];

/** Station where the market, mission board and colony services live. */
export const HOME_STATION_ID = 'solace';

export const REFINE_RECIPES: RefineRecipe[] = [
  { id: 'ferrite-alloys', input: 'ferrite', output: 'alloys', inputAmount: 10, outputAmount: 4, timeSeconds: 30, creditCost: 60 },
  { id: 'aurium-alloys', input: 'aurium', output: 'alloys', inputAmount: 8, outputAmount: 4, timeSeconds: 45, creditCost: 120 },
  { id: 'magmarite-nanocarbon', input: 'magmarite', output: 'nanocarbon', inputAmount: 12, outputAmount: 4, timeSeconds: 60, creditCost: 200 },
  { id: 'cryonite-nanocarbon', input: 'cryonite', output: 'nanocarbon', inputAmount: 10, outputAmount: 4, timeSeconds: 50, creditCost: 160 },
  { id: 'hexite-alloys', input: 'hexite', output: 'alloys', inputAmount: 6, outputAmount: 5, timeSeconds: 70, creditCost: 220 },
  { id: 'thryxium-isotopes', input: 'thryxium', output: 'isotopes', inputAmount: 8, outputAmount: 4, timeSeconds: 90, creditCost: 260 },
];

export const RESOURCE_INFO: Record<ResourceKind, ResourceInfo> = {
  ferrite: {
    kind: 'ferrite',
    name: { en: 'Ferrite', ar: 'فرايت' },
    description: { en: 'Common metallic ore used for hull plating and basic structures.', ar: 'خام معدني شائع يستخدم للدرع والبناء.' },
    category: 'raw',
    uses: ['hull plating', 'colony buildings', 'basic modules'],
    basePriceMin: 12,
    basePriceMax: 18,
    rarity: 0.3,
  },
  aurium: {
    kind: 'aurium',
    name: { en: 'Aurium', ar: 'أوريوم' },
    description: { en: 'Conductive ore used in electronics and capacitor systems.', ar: 'خام موصل يستخدم في الإلكترونيات والمكثفات.' },
    category: 'raw',
    uses: ['modules', 'capacitors', 'electronics'],
    basePriceMin: 28,
    basePriceMax: 38,
    rarity: 0.4,
  },
  cryonite: {
    kind: 'cryonite',
    name: { en: 'Cryonite', ar: 'كريونيت' },
    description: { en: 'Crystalline ice-ore with thermal properties.', ar: 'خام بلوري بخصائص حرارية.' },
    category: 'raw',
    uses: ['cooling systems', 'shields', 'advanced modules'],
    basePriceMin: 42,
    basePriceMax: 55,
    rarity: 0.6,
  },
  magmarite: {
    kind: 'magmarite',
    name: { en: 'Magmarite', ar: 'ماغمارايت' },
    description: { en: 'Volcanic rock infused with reactive compounds.', ar: 'صخر بركاني غني بمركبات تفاعلية.' },
    category: 'raw',
    uses: ['weapon systems', 'reactors', 'armor'],
    basePriceMin: 65,
    basePriceMax: 85,
    rarity: 0.7,
  },
  hexite: {
    kind: 'hexite',
    name: { en: 'Hexite', ar: 'هكسيت' },
    description: { en: 'Dense crystalline metal with high durability.', ar: 'معدن بلوري كثيف عالي المتانة.' },
    category: 'raw',
    uses: ['heavy armor', 'advanced plating', 'rigs'],
    basePriceMin: 95,
    basePriceMax: 125,
    rarity: 0.8,
  },
  thryxium: {
    kind: 'thryxium',
    name: { en: 'Thryxium', ar: 'ثريكسيم' },
    description: { en: 'Exotic matter found near gas giants.', ar: 'مادة غريبة توجد بالقرب من العمالقة الغازية.' },
    category: 'raw',
    uses: ['reactors', 'warp drives', 'high-end modules'],
    basePriceMin: 145,
    basePriceMax: 185,
    rarity: 0.85,
  },
  nanocarbon: {
    kind: 'nanocarbon',
    name: { en: 'Nanocarbon', ar: 'نانوكربون' },
    description: { en: 'Refined lattice material for lightweight structures.', ar: 'مادة شبكية خفيفة للإنشاءات.' },
    category: 'refined',
    uses: ['light hulls', 'repair systems', 'advanced structures'],
    basePriceMin: 180,
    basePriceMax: 230,
    rarity: 0.75,
  },
  isotopes: {
    kind: 'isotopes',
    name: { en: 'Fusion Isotopes', ar: 'نظائر اندماجية' },
    description: { en: 'Volatile isotopes for fusion reactors.', ar: 'نظائر متطايرة للمفاعلات الاندماجية.' },
    category: 'raw',
    uses: ['reactors', 'boosters', 'power systems'],
    basePriceMin: 220,
    basePriceMax: 290,
    rarity: 0.9,
  },
  alloys: {
    kind: 'alloys',
    name: { en: 'Refined Alloys', ar: 'سبائك مصقولة' },
    description: { en: 'High-grade alloys for advanced ship construction.', ar: 'سبائك عالية الجودة لبناء السفن المتقدمة.' },
    category: 'refined',
    uses: ['capital modules', 'shipyard', 'research'],
    basePriceMin: 250,
    basePriceMax: 320,
    rarity: 0.88,
  },
};

export function getZoneForPlanet(planetId: string): Zone | undefined {
  const mapping: Record<string, string> = {
    aurelia: 'aurelia-zone',
    magmae: 'magmae-zone',
    glacius: 'glacius-zone',
    thryx: 'thryx-zone',
    kratos: 'kratos-zone',
  };
  const zoneId = mapping[planetId];
  return ZONES.find(z => z.id === zoneId);
}

export function calculatePrice(baseMin: number, baseMax: number, supply: number = 1, demand: number = 1): number {
  const base = baseMin + (baseMax - baseMin) * 0.5;
  const drift = (demand / supply) * 1.2;
  const price = Math.round(base * drift);
  return Math.max(5, price);
}
