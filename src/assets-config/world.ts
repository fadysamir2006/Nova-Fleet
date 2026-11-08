import type { LocalizedText, ResourceKind } from '../game/types';

export interface ResourceInfo {
  name: LocalizedText;
  symbol: string;
  color: number;
  cssColor: string;
  glow: number;
  value: number;
  weight: number;
}

export const RESOURCES: Record<ResourceKind, ResourceInfo> = {
  ferrite: {
    name: { en: 'Ferrite', ar: 'فيرّيت' },
    symbol: 'Fe',
    color: 0x9e7048,
    cssColor: '#c08a59',
    glow: 0xffb36b,
    value: 2,
    weight: 1,
  },
  aurium: {
    name: { en: 'Aurium', ar: 'أوريوم' },
    symbol: 'Au',
    color: 0xd8a642,
    cssColor: '#ffc861',
    glow: 0xffd36e,
    value: 5,
    weight: 1.4,
  },
  cryonite: {
    name: { en: 'Cryonite', ar: 'كرايونايت' },
    symbol: 'Cy',
    color: 0x6fc7d8,
    cssColor: '#7ce8ff',
    glow: 0x83f4ff,
    value: 8,
    weight: 0.7,
  },
  magmarite: {
    name: { en: 'Magmarite', ar: 'ماغمارايت' },
    symbol: 'Mg',
    color: 0xff6a2b,
    cssColor: '#ff7a36',
    glow: 0xff9a4d,
    value: 14,
    weight: 1.6,
  },
  hexite: {
    name: { en: 'Hexite', ar: 'هكسيت' },
    symbol: 'Hx',
    color: 0x9b8bff,
    cssColor: '#b7a9ff',
    glow: 0xc9c0ff,
    value: 16,
    weight: 1.2,
  },
  thryxium: {
    name: { en: 'Thryxium', ar: 'ثريكسيم' },
    symbol: 'Tx',
    color: 0x8dffb5,
    cssColor: '#a8ffcb',
    glow: 0xc2ffe1,
    value: 18,
    weight: 0.9,
  },
  nanocarbon: {
    name: { en: 'Nanocarbon', ar: 'نانوكربون' },
    symbol: 'Nc',
    color: 0xb9b9b9,
    cssColor: '#d7d7d7',
    glow: 0xeaeaea,
    value: 24,
    weight: 1.0,
  },
  isotopes: {
    name: { en: 'Fusion Isotopes', ar: 'نظائر اندماجية' },
    symbol: 'Is',
    color: 0x7affff,
    cssColor: '#9dffff',
    glow: 0xc2ffff,
    value: 28,
    weight: 0.8,
  },
  alloys: {
    name: { en: 'Refined Alloys', ar: 'سبائك مصفاة' },
    symbol: 'Al',
    color: 0xffd98a,
    cssColor: '#ffe7b3',
    glow: 0xfff1d0,
    value: 32,
    weight: 1.1,
  },
};

export const RESOURCE_ORDER: readonly ResourceKind[] = [
  'ferrite',
  'aurium',
  'cryonite',
  'magmarite',
  'hexite',
  'thryxium',
  'nanocarbon',
  'isotopes',
  'alloys',
];

/**
 * World numbers are tuned alongside combat in `src/game/config.ts`. This
 * alias keeps asset/render imports stable while there is one source of truth.
 */
export { WORLD_TUNING as WORLD_CONFIG } from '../game/config';

export const QUALITY_LABELS: Record<'low' | 'medium' | 'high', LocalizedText> = {
  low: { en: 'Low', ar: 'منخفضة' },
  medium: { en: 'Medium', ar: 'متوسطة' },
  high: { en: 'High', ar: 'عالية' },
};

export const SUN_DIRECTION = { x: -0.58, y: 0.42, z: -0.7 };
