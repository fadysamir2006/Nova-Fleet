import type { ResourceKind } from './types';

export type ResourceCategory = 'raw' | 'refined';

export interface ResourceMeta {
  kind: ResourceKind;
  category: ResourceCategory;
  volume: number;
  baseValue: number;
}

export const RESOURCE_META: Record<ResourceKind, ResourceMeta> = {
  ferrite: { kind: 'ferrite', category: 'raw', volume: 1, baseValue: 2 },
  aurium: { kind: 'aurium', category: 'raw', volume: 1, baseValue: 5 },
  cryonite: { kind: 'cryonite', category: 'raw', volume: 1, baseValue: 8 },
  magmarite: { kind: 'magmarite', category: 'raw', volume: 1, baseValue: 14 },
  hexite: { kind: 'hexite', category: 'raw', volume: 1, baseValue: 16 },
  thryxium: { kind: 'thryxium', category: 'raw', volume: 1, baseValue: 18 },
  nanocarbon: { kind: 'nanocarbon', category: 'refined', volume: 1, baseValue: 24 },
  isotopes: { kind: 'isotopes', category: 'refined', volume: 1, baseValue: 28 },
  alloys: { kind: 'alloys', category: 'refined', volume: 1, baseValue: 32 },
};

export const REFINERY_RECIPES: Array<{
  input: ResourceKind;
  output: ResourceKind;
  ratio: number;
  cost: number;
}> = [
  { input: 'ferrite', output: 'alloys', ratio: 10, cost: 5 },
  { input: 'magmarite', output: 'alloys', ratio: 6, cost: 8 },
  { input: 'aurium', output: 'nanocarbon', ratio: 8, cost: 6 },
  { input: 'hexite', output: 'nanocarbon', ratio: 6, cost: 9 },
  { input: 'cryonite', output: 'isotopes', ratio: 10, cost: 4 },
  { input: 'thryxium', output: 'isotopes', ratio: 7, cost: 10 },
];

export class ResourceManager {
  constructor(
    private storage: Record<ResourceKind, number>,
    private capacity: number,
  ) {}

  getUsed(): number {
    let used = 0;
    for (const [k, v] of Object.entries(this.storage)) {
      used += (v as number) * (RESOURCE_META[k as ResourceKind]?.volume ?? 1);
    }
    return used;
  }

  canAdd(kind: ResourceKind, amount: number): boolean {
    const vol = RESOURCE_META[kind].volume;
    return this.getUsed() + vol * amount <= this.capacity + 1e-6;
  }

  add(kind: ResourceKind, amount: number): number {
    if (amount <= 0) return 0;
    let addAmt = amount;
    const vol = RESOURCE_META[kind].volume;
    if (this.getUsed() + vol * addAmt > this.capacity) {
      addAmt = Math.floor((this.capacity - this.getUsed()) / vol);
    }
    if (addAmt <= 0) return 0;
    this.storage[kind] = (this.storage[kind] ?? 0) + addAmt;
    return addAmt;
  }

  remove(kind: ResourceKind, amount: number): number {
    if (amount <= 0) return 0;
    const have = this.storage[kind] ?? 0;
    const take = Math.min(have, amount);
    if (take <= 0) return 0;
    this.storage[kind] = have - take;
    return take;
  }

  get(kind: ResourceKind): number {
    return this.storage[kind] ?? 0;
  }

  refineryCycle(): { output: ResourceKind; amount: number }[] {
    const results: { output: ResourceKind; amount: number }[] = [];
    for (const recipe of REFINERY_RECIPES) {
      const have = this.storage[recipe.input] ?? 0;
      const canDo = Math.floor(have / recipe.ratio);
      if (canDo <= 0) continue;
      const take = canDo * recipe.ratio;
      const out = canDo;
      this.remove(recipe.input, take);
      this.add(recipe.output, out);
      results.push({ output: recipe.output, amount: out });
    }
    return results;
  }
}
