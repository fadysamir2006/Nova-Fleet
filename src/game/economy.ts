import { RESOURCES, RESOURCE_ORDER } from '../assets-config';
import { MARKET_TUNING, REPAIR_TUNING } from './config';
import { REFINE_RECIPES, ZONES, type RefineRecipe } from './worldData';
import type { ResourceKind } from './types';

/** Structural copy of the saved refinery job shape (keeps game logic DOM-free). */
export interface RefineryJobData {
  id: string;
  recipeId: string;
  amount: number;
  startTime: number;
  finishTime: number;
  completed: boolean;
}

/** Buy/sell pair + trend (-1..1) for one resource at the current station. */
export interface MarketPrice {
  buy: number;
  sell: number;
  trend: number;
}

export type MarketPriceTable = Record<ResourceKind, MarketPrice>;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * 4D: local price multiplier for a zone/station.
 * Rare/dangerous zones pay slightly more for imports, while locally mined
 * resources are slightly cheaper because supply is high.
 */
export function zonePriceMultiplier(zoneId: string, kind: ResourceKind): number {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return 1;
  let multiplier = 1 + (zone.dangerLevel - 2) * MARKET_TUNING.dangerStep;
  if (zone.uniqueResources.includes(kind)) multiplier *= MARKET_TUNING.localResourceFactor;
  if (zone.type === 'station') multiplier *= MARKET_TUNING.stationFactor;
  return clamp(multiplier, MARKET_TUNING.zoneFactorMin, MARKET_TUNING.zoneFactorMax);
}

/** 4D: deterministic, time-based price drift with a visible trend arrow. */
export function refreshMarketPrices(
  _current: MarketPriceTable | Record<string, MarketPrice> | undefined,
  zoneId: string,
  now: number,
): MarketPriceTable {
  const bucket = Math.floor(now / MARKET_TUNING.driftPeriodMs);
  const next = {} as MarketPriceTable;
  RESOURCE_ORDER.forEach((kind, index) => {
    const base = RESOURCES[kind].value;
    const phase = bucket * 0.73 + index * 1.91;
    const drift = Math.sin(phase) * 0.7 + Math.sin(phase * 0.41 + 2.1) * 0.3;
    const trend = clamp(drift, -1, 1);
    const local = zonePriceMultiplier(zoneId, kind);
    const sell = Math.max(
      1,
      Math.round(base * MARKET_TUNING.sellBase * local * (1 + trend * MARKET_TUNING.driftAmplitude)),
    );
    const buy = Math.max(sell + 1, Math.round(sell * MARKET_TUNING.buyMarkup));
    next[kind] = { buy, sell, trend };
  });
  return next;
}

export function getRecipe(recipeId: string): RefineRecipe | undefined {
  return REFINE_RECIPES.find((recipe) => recipe.id === recipeId);
}

/** 4D: matches the cost of a refinery job in the station UI. */
export function getRefineCost(recipe: RefineRecipe, batches = 1): { credits: number } {
  return { credits: recipe.creditCost * Math.max(1, Math.floor(batches)) };
}

export function createRefineryJob(
  recipeId: string,
  now: number,
  batches = 1,
): RefineryJobData | null {
  const recipe = getRecipe(recipeId);
  if (!recipe) return null;
  const amount = Math.max(1, Math.floor(batches));
  return {
    id: `${recipeId}-${now}-${Math.random().toString(36).slice(2, 7)}`,
    recipeId,
    amount,
    startTime: now,
    finishTime: now + recipe.timeSeconds * 1000 * amount,
    completed: false,
  };
}

export function refineJobRemaining(job: RefineryJobData, now: number): number {
  return Math.max(0, job.finishTime - now);
}

/** 4D: station hull/shield repair costs credits, never free. */
export function getRepairCost(missingHull: number, missingShield: number): number {
  return Math.max(
    0,
    Math.ceil(
      Math.max(0, missingHull) * REPAIR_TUNING.perHull +
        Math.max(0, missingShield) * REPAIR_TUNING.perShield,
    ),
  );
}
